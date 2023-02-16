FROM hayd/alpine-deno:1.0.0

EXPOSE 8080 


USER deno

COPY deps.ts .
RUN deno cache deps.ts

COPY . .
RUN deno cache chatbot.ts

CMD ["run","--allow-net", "chatbot.ts"]