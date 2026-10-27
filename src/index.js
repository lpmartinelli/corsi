export default {
  async fetch(request, env, ctx) {
    return new Response("Hello from corsi!", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
