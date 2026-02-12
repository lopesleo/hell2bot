import * as db from './db.js';
import * as hd from './helldivers.js';
import { stableHash } from './util.js';

const SUCCESS_TERMS = ['success', 'completed', 'victory', 'reward', 'liberated'];
const FAIL_TERMS = ['failed', 'defeat', 'delayed', 'lost'];

// ── Text cleanup ────────────────────────────────────
function translateBrief(text) {
  if (!text) return text;
  // Strip HTML-like tags from game text: <i=3>, <i=1>, etc.
  return text.replace(/<\/?i(?:=[^>]*)?\/?>/gi, '');
}

// ── Planet names cache ──────────────────────────────
let planetNamesCache = null;

export async function loadPlanetNames(log) {
  if (planetNamesCache) return planetNamesCache;
  try {
    const planets = await hd.getPlanets();
    await hd.rateSleep();
    const map = {};
    for (const [idx, info] of Object.entries(planets)) {
      map[Number(idx)] = info.name;
    }
    planetNamesCache = map;
    return map;
  } catch (e) {
    if (log) log.warn(e, 'Failed to load planet names');
    return {};
  }
}

// ── Order progress parsing ──────────────────────────
function parseOrderProgress(order) {
  const tasks = order.setting?.tasks || [];
  const progress = order.progress || [];
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const current = progress[i] || 0;

    let target = 0;
    if (Array.isArray(task.valueTypes) && Array.isArray(task.values)) {
      const targetIdx = task.valueTypes.indexOf(3);
      if (targetIdx !== -1) target = task.values[targetIdx] || 0;
    }

    const pct = target > 0 ? Math.round((current / target) * 10000) / 100 : 0;

    let label = `Tarefa ${i + 1}`;
    if (task.type === 7) label = 'Missões';
    else if (task.type === 3) {
      const enemyIdx = task.valueTypes?.indexOf(4);
      const enemyId = enemyIdx !== -1 ? task.values?.[enemyIdx] : null;
      label = enemyId && hd.ENEMY_NAMES[enemyId]
        ? `Eliminar ${hd.ENEMY_NAMES[enemyId]}`
        : `Eliminar alvos ${i + 1}`;
    }
    else if (task.type === 12) label = 'Defesa';

    results.push({ current, target, pct: Math.min(pct, 100), label });
  }
  return results;
}

// ── ETA calculation ─────────────────────────────────
// Uses prev snapshot (saved before current) to calculate rate
function computeETA(order) {
  const taskProgress = parseOrderProgress(order);
  const prevSnapshot = db.getStateJSON('progress_snapshot_prev_json') || {};
  const prevTs = parseInt(db.getState('progress_snapshot_prev_ts') || '0', 10);
  const currSnapshot = db.getStateJSON('progress_snapshot_json') || {};
  const currTs = parseInt(db.getState('progress_snapshot_ts') || '0', 10);

  if (!prevTs || !currTs || currTs <= prevTs) return [];

  const elapsed = (currTs - prevTs) / 1000; // seconds between polls
  if (elapsed < 60) return [];

  const etas = [];
  for (let i = 0; i < taskProgress.length; i++) {
    const tp = taskProgress[i];
    const key = `${order.id32}_${i}`;
    const prevVal = prevSnapshot[key] || 0;
    const currVal = currSnapshot[key] || 0;

    if (prevVal > 0 && currVal > prevVal) {
      const rate = (currVal - prevVal) / elapsed; // units per second
      const remaining = tp.target - tp.current;
      if (rate > 0 && remaining > 0) {
        const etaSec = remaining / rate;
        const etaH = Math.round(etaSec / 3600);
        etas.push({ label: tp.label, etaH, rate, pct: tp.pct });
      }
    }
  }
  return etas;
}

function saveProgressSnapshot(orders) {
  const snapshot = {};
  for (const order of orders) {
    const tasks = order.setting?.tasks || [];
    const progress = order.progress || [];
    for (let i = 0; i < tasks.length; i++) {
      snapshot[`${order.id32}_${i}`] = progress[i] || 0;
    }
  }
  // Move current → prev, then save new current
  const oldSnap = db.getState('progress_snapshot_json');
  const oldTs = db.getState('progress_snapshot_ts');
  if (oldSnap && oldTs) {
    db.setState('progress_snapshot_prev_json', oldSnap);
    db.setState('progress_snapshot_prev_ts', oldTs);
  }
  db.setState('progress_snapshot_json', JSON.stringify(snapshot));
  db.setState('progress_snapshot_ts', String(Date.now()));
}

// ═══════════════════════════════════════════════════
//  MAIN POLL
// ═══════════════════════════════════════════════════
export async function poll(logger) {
  const events = [];
  const log = logger.child({ module: 'detector' });

  try {
    const orders = await hd.getMajorOrders();
    await hd.rateSleep();

    const prevOrdersRaw = db.getState('last_orders_json') || '[]';
    const prevOrders = JSON.parse(prevOrdersRaw);
    const prevHash = stableHash(prevOrders);
    const currHash = stableHash(orders);

    const hadOrders = Array.isArray(prevOrders) && prevOrders.length > 0;
    const hasOrders = Array.isArray(orders) && orders.length > 0;

    // ── New/changed orders ──
    if (hasOrders && currHash !== prevHash) {
      db.setState('last_known_orders_json', JSON.stringify(orders));

      for (const order of orders) {
        const prevOrder = prevOrders.find(o => o.id32 === order.id32);
        if (!prevOrder) {
          const title = translateBrief(order.setting?.overrideBrief || order.setting?.taskDescription || 'Nova Order');
          const orderTitle = order.setting?.overrideTitle || 'MAJOR ORDER';
          const reward = order.setting?.reward?.amount;
          const rewardType = order.setting?.reward?.type === 1 ? 'Medalhas' : 'Requisição';
          const deadline = order.expiresIn ? `${Math.round(order.expiresIn / 3600)}h` : '?';

          let msg = `🔴 *NOVA ${orderTitle}*\n\n📋 ${title}\n`;
          if (reward) msg += `🎖️ Recompensa: ${reward} ${rewardType}\n`;
          msg += `⏰ Prazo: ${deadline}\n`;

          const tp = parseOrderProgress(order);
          if (tp.length > 0) {
            msg += '\n*Objetivos:*\n';
            for (const t of tp) msg += `  • ${t.label}: ${fmtNum(t.target)}\n`;
          }
          msg += '\nPor Super Earth! 🌍';

          events.push({ type: 'new_major_order', message: msg });
        }
      }
    }

    // ── Order ended ──
    if (hadOrders) {
      for (const prevOrder of prevOrders) {
        const stillExists = (orders || []).find(o => o.id32 === prevOrder.id32);
        if (!stillExists) {
          const title = translateBrief(prevOrder.setting?.overrideBrief || prevOrder.setting?.overrideTitle || 'Order');
          const reward = prevOrder.setting?.reward?.amount;
          const rewardType = prevOrder.setting?.reward?.type === 1 ? 'Medalhas' : 'Requisição';

          const taskProgress = parseOrderProgress(prevOrder);
          const allComplete = taskProgress.length > 0 && taskProgress.every(t => t.pct >= 100);

          let newsHint = '';
          try {
            const lastNewsTs = parseInt(db.getState('last_news_ts') || '0', 10);
            const news = await hd.getNews(lastNewsTs);
            await hd.rateSleep();
            const newsText = (news || []).map(n => (n.message || '').toLowerCase()).join(' ');
            if (SUCCESS_TERMS.some(t => newsText.includes(t))) newsHint = 'success';
            else if (FAIL_TERMS.some(t => newsText.includes(t))) newsHint = 'fail';
          } catch (e) { /* ignore */ }

          if (allComplete || newsHint === 'success') {
            let msg = `🟢 *MAJOR ORDER CONCLUÍDA COM SUCESSO!*\n\n📋 ${title}\n`;
            if (reward) msg += `\n🎖️ *${reward} ${rewardType} disponíveis para coleta!*\nAbra o jogo e resgate sua recompensa! 🎮`;
            else msg += `\nMissão completada! Parabéns, Helldivers! 🎖️`;
            events.push({ type: 'major_order_success', message: msg });
          } else if (newsHint === 'fail') {
            events.push({
              type: 'major_order_fail',
              message: `⚫ *MAJOR ORDER FALHOU*\n\n📋 ${title}\n\nA missão não foi completada a tempo.\nDemocracia Gerenciada demanda mais esforço! 💀`,
            });
          } else {
            events.push({
              type: 'major_order_ended',
              message: `⚪ *MAJOR ORDER ENCERRADA*\n\n📋 ${title}\n\nAguardando novas ordens de Super Earth...`,
            });
          }
        }
      }
    }

    db.setState('last_orders_json', JSON.stringify(orders));

    // Save progress snapshot for ETA calculations
    if (hasOrders) saveProgressSnapshot(orders);

    // ── News check ──
    const lastNewsTs = parseInt(db.getState('last_news_ts') || '0', 10);
    let news = [];
    try {
      news = await hd.getNews(lastNewsTs);
      await hd.rateSleep();
    } catch (e) {
      log.warn(e, 'Failed to fetch news');
    }

    if (Array.isArray(news) && news.length > 0) {
      let maxTs = lastNewsTs;
      for (const item of news) {
        const ts = item.published || item.publishedAt || item.timestamp || 0;
        if (ts > maxTs) maxTs = ts;
      }
      db.setState('last_news_ts', String(maxTs));
    }

    // ── Global Events / Dispatches ──
    try {
      const warStatus = await hd.getWarStatus();
      await hd.rateSleep();

      const prevEventIds = db.getStateJSON('last_event_ids_json') || [];
      const currEventIds = [];

      if (Array.isArray(warStatus.globalEvents)) {
        for (const ev of warStatus.globalEvents) {
          if (!ev.eventId || !ev.title) continue;
          currEventIds.push(ev.eventId);

          if (prevEventIds.length > 0 && !prevEventIds.includes(ev.eventId) && ev.message) {
            const cleanMsg = translateBrief(ev.message);
            if (cleanMsg.trim().length > 0) {
              events.push({
                type: 'global_event',
                message: `📡 *DESPACHO: ${ev.title}*\n\n${cleanMsg.substring(0, 500)}`,
              });
            }
          }
        }
      }
      db.setState('last_event_ids_json', JSON.stringify(currEventIds));

      // ── Campaign alerts — only for Major Order planets ──
      if (hasOrders) {
        const orderPlanetIndices = hd.extractPlanetIndices(orders);
        const prevCampaignIds = db.getStateJSON('last_campaign_ids_json') || [];
        const currCampaignIds = [];

        if (Array.isArray(warStatus.campaigns)) {
          const planetNames = await loadPlanetNames(log);

          const ownerMap = new Map();
          if (Array.isArray(warStatus.planetStatus)) {
            for (const ps of warStatus.planetStatus) ownerMap.set(ps.index, ps.owner);
          }

          for (const c of warStatus.campaigns) {
            currCampaignIds.push(c.id);

            // Only alert for Major Order planets, and only after baseline
            if (prevCampaignIds.length > 0
                && !prevCampaignIds.includes(c.id)
                && orderPlanetIndices.includes(c.planetIndex)) {
              const name = planetNames[c.planetIndex] || `Planet #${c.planetIndex}`;
              const owner = ownerMap.get(c.planetIndex) ?? c.race;
              const enemy = hd.OWNER_NAMES[owner] || 'Inimigo desconhecido';
              const raceEmoji = { 2: '🪲', 3: '🤖', 4: '👁️' };
              const emoji = raceEmoji[owner] || '👾';

              if (owner === 1) continue;

              events.push({
                type: 'new_campaign',
                message: `⚔️ *COMBATE NA MAJOR ORDER!*\n\n🌐 ${name}\n${emoji} Inimigo: ${enemy}\n\nEsse planeta é objetivo da Major Order! Foco nele! 🎯`,
              });
            }
          }
          if (prevCampaignIds.length === 0) log.info('First poll — saved campaigns baseline, no alerts');
        }
        db.setState('last_campaign_ids_json', JSON.stringify(currCampaignIds));
      }

      // ── Planet lost / liberated detection ──
      const prevPlanetOwners = db.getStateJSON('last_planet_owners_json') || {};
      const currPlanetOwners = {};

      if (Array.isArray(warStatus.planetStatus)) {
        const planetNames = await loadPlanetNames(log);

        for (const ps of warStatus.planetStatus) {
          currPlanetOwners[ps.index] = ps.owner;

          const prevOwner = prevPlanetOwners[ps.index];
          if (prevOwner !== undefined) {
            if (prevOwner === 1 && ps.owner !== 1) {
              const name = planetNames[ps.index] || `Planet #${ps.index}`;
              const enemy = hd.OWNER_NAMES[ps.owner] || 'Inimigo';
              events.push({
                type: 'planet_lost',
                message: `🔴 *PLANETA PERDIDO!*\n\n🌐 ${name} foi tomado por ${enemy}!\n\nContra-ataque necessário!`,
              });
            }
            if (prevOwner !== 1 && ps.owner === 1 && ps.players > 100) {
              const name = planetNames[ps.index] || `Planet #${ps.index}`;
              events.push({
                type: 'planet_liberated',
                message: `🟢 *PLANETA LIBERADO!*\n\n🌐 ${name} foi liberado!\n\nDemocracia Gerenciada prevalece! 🌍`,
              });
            }
          }
        }
      }
      if (Object.keys(prevPlanetOwners).length > 0) {
        db.setState('last_planet_owners_json', JSON.stringify(currPlanetOwners));
      } else {
        db.setState('last_planet_owners_json', JSON.stringify(currPlanetOwners));
        log.info('First poll — saved planet owners baseline, no alerts');
      }

      // ── Planet Watch (order planets >=95%) ──
      if (hasOrders) {
        const planetIndices = hd.extractPlanetIndices(orders);
        log.info({ planetIndices }, 'Extracted planet indices');

        if (planetIndices.length > 0) {
          const planetNames = await loadPlanetNames(log);
          const progressMap = hd.getPlanetProgress(warStatus, planetIndices, planetNames);
          const prevAlerts = db.getStateJSON('last_planet_alert_json') || {};

          for (const [idx, info] of progressMap) {
            const prev = prevAlerts[idx] || 0;
            const curr = info.progress;

            if (curr >= 95 && (prev < 95 || curr - prev >= 2)) {
              events.push({
                type: 'planet_critical',
                message:
                  `🟡 *PLANETA EM FASE CRÍTICA!*\n\n` +
                  `🌐 ${info.name}\n` +
                  `📊 Progresso: ${curr}%\n` +
                  `👥 Jogadores: ${(info.players || 0).toLocaleString()}\n` +
                  `\nQuase lá, Helldivers! Continuem o ataque! 🔥`,
              });
              prevAlerts[idx] = curr;
            } else if (curr >= 95) {
              prevAlerts[idx] = curr;
            }
          }

          db.setState('last_planet_alert_json', JSON.stringify(prevAlerts));
          db.setState('last_planets_json', JSON.stringify([...progressMap.values()]));
        }
      }

    } catch (err) {
      log.warn(err, 'War status checks failed');
    }

  } catch (err) {
    log.error(err, 'Poll cycle error');
  }

  return events;
}

// ═══════════════════════════════════════════════════
//  COMMAND BUILDERS
// ═══════════════════════════════════════════════════

export async function buildStatus(logger) {
  const lines = [];
  const log = logger.child({ module: 'status' });

  try {
    const orders = await hd.getMajorOrders();
    await hd.rateSleep();

    if (Array.isArray(orders) && orders.length > 0) {
      for (const o of orders) {
        const title = translateBrief(o.setting?.overrideBrief || o.setting?.taskDescription || 'N/A');
        const deadline = o.expiresIn ? `${Math.round(o.expiresIn / 3600)}h ${Math.round((o.expiresIn % 3600) / 60)}m` : '?';
        const orderTitle = o.setting?.overrideTitle || 'MAJOR ORDER';
        const reward = o.setting?.reward?.amount;
        const rewardType = o.setting?.reward?.type === 1 ? 'Medalhas' : 'Requisição';

        lines.push(`📋 *${orderTitle}*`);
        lines.push(title);
        if (reward) lines.push(`🎖️ Recompensa: ${reward} ${rewardType}`);
        lines.push(`⏰ Prazo: ${deadline}`);

        const taskProgress = parseOrderProgress(o);
        for (const tp of taskProgress) {
          const bar = progressBar(tp.pct);
          lines.push(`  ${tp.label}: ${bar} ${tp.pct}% (${fmtNum(tp.current)}/${fmtNum(tp.target)})`);
        }

        const etas = computeETA(o);
        if (etas.length > 0) {
          const deadlineH = o.expiresIn ? Math.round(o.expiresIn / 3600) : null;
          for (const e of etas) {
            const emoji = deadlineH && e.etaH <= deadlineH ? '✅' : '⚠️';
            lines.push(`  ${emoji} ${e.label}: ~${e.etaH}h ETA (${fmtNum(Math.round(e.rate * 3600))}/hora)`);
          }
        }
        lines.push('');
      }
    } else {
      lines.push('📋 *Major Order:* Nenhuma ativa');
    }

    const warStatus = await hd.getWarStatus();
    await hd.rateSleep();

    const totalPlayers = (warStatus?.planetStatus || []).reduce((s, p) => s + (p.players || 0), 0);
    lines.push(`👥 Jogadores ativos: ${totalPlayers.toLocaleString()}`);

    const planets = db.getStateJSON('last_planets_json');
    if (Array.isArray(planets) && planets.length > 0) {
      lines.push('');
      lines.push('🌐 *Planetas da Order:*');
      const sorted = [...planets].sort((a, b) => (b.players || 0) - (a.players || 0)).slice(0, 5);
      for (const p of sorted) {
        const players = (p.players || 0).toLocaleString();
        const status = p.owner === 1 ? '✅ Liberado' : p.hasCampaign ? '⚔️ Em combate' : '🔴 Inimigo';
        lines.push(`  ${p.name}: ${status} | ${players} jogadores`);
      }
    }
  } catch (err) {
    log.error(err, 'buildStatus error');
    lines.push('⚠️ Erro ao buscar dados da API.');
  }

  return lines.join('\n');
}

export async function buildOrderDetail(logger) {
  const lines = [];
  try {
    const orders = await hd.getMajorOrders();
    await hd.rateSleep();

    if (!Array.isArray(orders) || orders.length === 0) {
      return '📋 Nenhuma Major Order ativa no momento.';
    }

    for (const o of orders) {
      const title = translateBrief(o.setting?.overrideBrief || o.setting?.taskDescription || 'N/A');
      const orderTitle = o.setting?.overrideTitle || 'MAJOR ORDER';
      const reward = o.setting?.reward?.amount;
      const rewardType = o.setting?.reward?.type === 1 ? 'Medalhas' : 'Requisição';
      const deadline = o.expiresIn ? `${Math.round(o.expiresIn / 3600)}h ${Math.round((o.expiresIn % 3600) / 60)}m` : '?';

      lines.push(`📋 *${orderTitle}*`);
      lines.push(title);
      if (reward) lines.push(`🎖️ Recompensa: ${reward} ${rewardType}`);
      lines.push(`⏰ Prazo: ${deadline}`);
      lines.push('');

      const taskProgress = parseOrderProgress(o);
      lines.push('*Progresso:*');
      for (const tp of taskProgress) {
        const bar = progressBar(tp.pct);
        lines.push(`  ${tp.label}`);
        lines.push(`  ${bar} ${tp.pct}%`);
        lines.push(`  ${fmtNum(tp.current)} / ${fmtNum(tp.target)}`);
        lines.push('');
      }

      // ETA
      const etas = computeETA(o);
      if (etas.length > 0) {
        lines.push('*Estimativa (ETA):*');
        for (const e of etas) {
          const rateH = fmtNum(Math.round(e.rate * 3600));
          lines.push(`  ${e.label}: ~${e.etaH}h restantes (${rateH}/hora)`);
        }
        lines.push('');
      }

      lines.push('─'.repeat(30));
      lines.push('');
    }
  } catch (err) {
    lines.push('⚠️ Erro ao buscar orders.');
  }
  return lines.join('\n');
}

export async function buildPlanets(logger) {
  const lines = [];
  try {
    const planetNames = await loadPlanetNames(logger);
    const warStatus = await hd.getWarStatus();
    await hd.rateSleep();

    const campaigns = hd.getAllCampaigns(warStatus, planetNames);

    if (campaigns.length === 0) {
      return '🌐 Nenhum combate ativo no momento.';
    }

    lines.push(`🌐 *Planetas em Combate (${campaigns.length}):*\n`);
    const raceEmoji = { 2: '🪲', 3: '🤖', 4: '👁️' };

    for (const c of campaigns.slice(0, 15)) {
      const emoji = raceEmoji[c.owner] || '❓';
      const players = (c.players || 0).toLocaleString();
      lines.push(`${emoji} *${c.name}* — ${players} jogadores`);
    }

    if (campaigns.length > 15) {
      lines.push(`\n... e mais ${campaigns.length - 15} planetas`);
    }
  } catch (err) {
    lines.push('⚠️ Erro ao buscar planetas.');
  }
  return lines.join('\n');
}

export async function buildTop(logger) {
  const lines = [];
  try {
    const planetNames = await loadPlanetNames(logger);
    const warStatus = await hd.getWarStatus();
    await hd.rateSleep();

    const campaigns = hd.getAllCampaigns(warStatus, planetNames);

    if (campaigns.length === 0) {
      return '🌐 Nenhum combate ativo no momento.';
    }

    const raceEmoji = { 2: '🪲', 3: '🤖', 4: '👁️' };
    const totalPlayers = (warStatus?.planetStatus || []).reduce((s, p) => s + (p.players || 0), 0);

    lines.push(`🏆 *TOP 10 — Planetas Mais Populares*`);
    lines.push(`👥 Total: ${totalPlayers.toLocaleString()} Helldivers ativos\n`);

    const top10 = campaigns.slice(0, 10);
    for (let i = 0; i < top10.length; i++) {
      const c = top10[i];
      const emoji = raceEmoji[c.owner] || '❓';
      const players = (c.players || 0).toLocaleString();
      const pctOfTotal = totalPlayers > 0 ? ((c.players / totalPlayers) * 100).toFixed(1) : '0';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const enemy = hd.OWNER_NAMES[c.owner] || '?';
      lines.push(`${medal} ${emoji} *${c.name}*`);
      lines.push(`   ${players} jogadores (${pctOfTotal}%) — vs ${enemy}`);
    }
  } catch (err) {
    lines.push('⚠️ Erro ao buscar planetas.');
  }
  return lines.join('\n');
}

export async function buildETA(logger) {
  const lines = [];
  try {
    const orders = await hd.getMajorOrders();
    await hd.rateSleep();

    if (!Array.isArray(orders) || orders.length === 0) {
      return '📋 Nenhuma Major Order ativa.';
    }

    let hasETA = false;
    for (const o of orders) {
      const orderTitle = o.setting?.overrideTitle || 'MAJOR ORDER';
      const etas = computeETA(o);
      const deadline = o.expiresIn ? Math.round(o.expiresIn / 3600) : null;

      if (etas.length > 0) {
        hasETA = true;
        lines.push(`⏱️ *ETA — ${orderTitle}*`);
        if (deadline) lines.push(`⏰ Prazo restante: ${deadline}h`);
        lines.push('');

        for (const e of etas) {
          const rateH = fmtNum(Math.round(e.rate * 3600));
          const emoji = deadline && e.etaH <= deadline ? '✅' : '⚠️';
          lines.push(`${emoji} ${e.label}`);
          lines.push(`  ETA: ~${e.etaH}h | Velocidade: ${rateH}/hora | ${e.pct}% completo`);
          if (deadline) {
            lines.push(`  ${e.etaH <= deadline ? 'No ritmo para completar!' : 'RITMO INSUFICIENTE — precisa acelerar!'}`);
          }
          lines.push('');
        }
        lines.push('');
      }
    }

    if (!hasETA) {
      lines.push('⏱️ *ETA ainda indisponível*');
      lines.push('Preciso de pelo menos 2 ciclos de poll (~10 min) para calcular a velocidade.');
    }
  } catch (err) {
    lines.push('⚠️ Erro ao calcular ETA.');
  }
  return lines.join('\n');
}

export function buildHelp() {
  return [
    '🤖 *Hell2Bot — Comandos*\n',
    '📊 /status — Resumo geral (orders, progresso, planetas)',
    '📋 /order — Detalhe das Major Orders com progresso e ETA',
    '🌐 /planets — Todos os planetas em combate ativo',
    '🏆 /top — Top 10 planetas mais populares',
    '⏱️ /eta — Estimativa de conclusão das orders',
    '🔄 /pollnow — Forçar verificação imediata',
    '📜 /listgroups — Listar grupos (admin)',
    '❓ /help — Esta mensagem',
    '\n_O bot verifica a cada 5 min e envia alertas automáticos._',
    '_Resumo diário às 08:00 e 20:00._',
    '\n_Alertas: novas orders, orders concluídas/falhadas,_',
    '_planetas perdidos/liberados, despachos globais._',
  ].join('\n');
}

// ── Daily summary ───────────────────────────────────
export async function buildDailySummary(logger) {
  const lines = [];
  const log = logger.child({ module: 'daily' });

  try {
    lines.push('📊 *RESUMO DIÁRIO — Helldivers 2*\n');

    const orders = await hd.getMajorOrders();
    await hd.rateSleep();

    if (Array.isArray(orders) && orders.length > 0) {
      for (const o of orders) {
        const title = translateBrief(o.setting?.overrideBrief || o.setting?.taskDescription || 'N/A');
        const orderTitle = o.setting?.overrideTitle || 'MAJOR ORDER';
        const reward = o.setting?.reward?.amount;
        const deadline = o.expiresIn ? `${Math.round(o.expiresIn / 3600)}h` : '?';

        lines.push(`📋 *${orderTitle}*`);
        lines.push(title);
        if (reward) lines.push(`🎖️ ${reward} Medalhas`);
        lines.push(`⏰ ${deadline} restantes`);

        const taskProgress = parseOrderProgress(o);
        for (const tp of taskProgress) {
          const bar = progressBar(tp.pct);
          lines.push(`  ${tp.label}: ${bar} ${tp.pct}%`);
        }

        const etas = computeETA(o);
        for (const e of etas) {
          lines.push(`  ⏱️ ${e.label}: ~${e.etaH}h ETA`);
        }
        lines.push('');
      }
    } else {
      lines.push('📋 Nenhuma Major Order ativa\n');
    }

    const warStatus = await hd.getWarStatus();
    await hd.rateSleep();

    const totalPlayers = (warStatus?.planetStatus || []).reduce((s, p) => s + (p.players || 0), 0);
    lines.push(`👥 ${totalPlayers.toLocaleString()} Helldivers ativos`);

    const planetNames = await loadPlanetNames(log);
    const campaigns = hd.getAllCampaigns(warStatus, planetNames);
    if (campaigns.length > 0) {
      lines.push(`⚔️ ${campaigns.length} planetas em combate`);
      const top3 = campaigns.slice(0, 3);
      for (const c of top3) {
        lines.push(`  • ${c.name}: ${(c.players || 0).toLocaleString()} jogadores`);
      }
    }

    lines.push('\n_Use /status para info completa | /help para comandos_');
  } catch (err) {
    log.error(err, 'buildDailySummary error');
    lines.push('⚠️ Erro ao gerar resumo.');
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────
function progressBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function fmtNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export function getStateSnapshot() {
  return {
    lastOrdersJson: db.getStateJSON('last_orders_json'),
    lastNewsTs: db.getState('last_news_ts'),
    lastPlanetsJson: db.getStateJSON('last_planets_json'),
    lastPlanetAlertJson: db.getStateJSON('last_planet_alert_json'),
    lastKnownOrders: db.getStateJSON('last_known_orders_json'),
    lastEventIds: db.getStateJSON('last_event_ids_json'),
    lastCampaignIds: db.getStateJSON('last_campaign_ids_json'),
  };
}
