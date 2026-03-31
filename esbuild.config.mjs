import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const banner =
  "/* eslint-disable */\n" +
  "var __create = Object.create;\n" +
  "var __defProp = Object.defineProperty;\n" +
  "var __getOwnPropDesc = Object.getOwnPropertyDescriptor;\n" +
  "var __getOwnPropNames = Object.getOwnPropertyNames;\n" +
  "var __getProtoOf = Object.getPrototypeOf;\n" +
  "var __hasOwnProp = Object.prototype.hasOwnProperty;\n" +
  "var __export = (target, all) => {\n" +
  "  for (var name in all)\n" +
  "    __defProp(target, name, { get: all[name], enumerable: true });\n" +
  "};\n" +
  "var __copyProps = (to, from, except, desc) => {\n" +
  "  if (from && typeof from === 'object' || typeof from === 'function') {\n" +
  "    for (let key of __getOwnPropNames(from))\n" +
  "      if (!__hasOwnProp.call(to, key) && key !== except)\n" +
  "        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });\n" +
  "  }\n" +
  "  return to;\n" +
  "};\n" +
  "var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(\n" +
  "  isNodeMode || !mod || !mod.__esModule ? __defProp(target, 'default', { value: mod, enumerable: true }) : target,\n" +
  "  mod\n" +
  "));\n";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  banner: {
    js: banner
  }
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
