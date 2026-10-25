import { mount } from "svelte";
import "@fontsource-variable/instrument-sans";
import "@imput/helium-prism/styles.css";
import "./lock.css";
import "./lock";
import "./pointer";
import App from "./App.svelte";
import { applyCachedBrowserTheme } from "./theme";

applyCachedBrowserTheme();

mount(App, { target: document.getElementById("app")! });
