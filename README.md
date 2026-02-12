# Hell2Bot - Helldivers 2 WhatsApp Monitor

Bot 24/7 que monitora Helldivers 2 e notifica um grupo WhatsApp sobre Major Orders, Daily Orders e progresso de planetas.

## Funcionalidades

- **Major Order**: detecta novas orders, sucesso e falhas
- **Daily/Personal Orders**: via news feed
- **Planet Watch**: alerta quando planetas da order chegam em >=95%
- **Comandos**: `/status`, `/pollnow`, `/listgroups`

## Setup

```bash
npm install
cp .env.example .env
# Edite .env com seus valores reais (GROUP_JID, ADMIN_PHONES)
node index.js
```

Na primeira execução, escaneie o QR code no terminal com o WhatsApp.

### Descobrir o GROUP_JID

1. Inicie o bot com qualquer GROUP_JID temporário
2. Envie `/listgroups` de um número que esteja em ADMIN_PHONES
3. Copie o JID do grupo desejado (formato: `123456789-123456@g.us`)
4. Atualize o `.env` e reinicie

## Produção (PM2)

```bash
chmod +x deploy.sh
./deploy.sh
```

## Comandos no Grupo

| Comando | Descrição |
|---------|-----------|
| `/status` | Resumo atual: Major Order, planetas, jogadores |
| `/pollnow` | Força um ciclo de verificação imediato |
| `/listgroups` | Lista grupos (admin only) |

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `API_PRIMARY` | URL da API Helldivers Training Manual |
| `API_FALLBACK` | URL fallback |
| `DB_PATH` | Caminho do SQLite |
| `RATE_SLEEP_MS` | Pausa entre chamadas API (ms) |
| `POLL_CRON` | Expressão cron do polling |
| `ADMIN_PHONES` | Telefones admin (separados por vírgula) |
| `GROUP_JID` | JID do grupo WhatsApp |
| `PORT` | Porta do servidor HTTP debug |
| `DEBUG` | `true` para logs detalhados |
