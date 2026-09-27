# Documentação técnica — Cleiton Bot

Documentação de arquitetura, stack e operação do **Cleiton Bot**, mantido por **ZamohtExe**.

| Documento | Conteúdo |
|-----------|----------|
| [Arquitetura](./arquitetura.md) | Visão geral, fluxo de mensagens e estrutura do repositório |
| [Stack e tecnologias](./tecnologias.md) | Dependências, papéis e justificativas técnicas |
| [Operação e deploy](./operacao.md) | Cloud API, webhook, variáveis, PM2 e o processo Baileys que fica parado |
| [API de comandos](./comandos.md) | Contratos dos comandos (`!s`, `!so`, ajuda, metadados) |

---

**Produto:** bot de figurinhas (estáticas e animadas) no WhatsApp — modos esticado e proporção original, só em conversa individual  
**Runtime:** Node.js 18+ (ES Modules), WhatsApp Cloud API em produção  
**Licença:** MIT — Copyright © 2026 ZamohtExe
