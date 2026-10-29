process.env.PORT ??= "8080";
process.env.NITRO_PORT ??= process.env.PORT;
process.env.HOST ??= "0.0.0.0";

await import("../.output/server/index.mjs");
