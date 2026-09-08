# Caminho web v1.2 — Android-first

A mãe usa Android; o usuário usa iPhone.

Mudanças:
- Android/Chrome é agora o alvo principal;
- fluxo nativo `beforeinstallprompt` quando o Chrome disponibiliza instalação;
- fallback claro: Chrome ⋮ → Adicionar à tela inicial / Instalar app;
- botão de instalação some quando o app já está em modo standalone;
- tratamento do botão Voltar do Android na tela de instalação;
- instrução separada para Safari/iPhone;
- PWA manifest ajustado para educação/standalone;
- mesma base continua compatível com iPhone.

Próximo marco: hospedagem HTTPS e teste funcional em navegador real.
