// Worker do torrevammo — serve arquivos estáticos via Workers Static Assets
// Redireciona / pra /torre.html, resto vem do assets binding

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '') {
      return Response.redirect(new URL('/torre.html', request.url).toString(), 302);
    }
    return env.ASSETS.fetch(request);
  }
};
