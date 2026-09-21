import "./style.css";
import { mountApp } from "./ui.ts";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root element");

mountApp(root);
