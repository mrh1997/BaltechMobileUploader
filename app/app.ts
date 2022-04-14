import Vue from "nativescript-vue";
import CompositionAPI from "@vue/composition-api";
import Home from "./components/Home.vue";

declare let __DEV__: boolean;

// Prints Vue logs when --env.production is *NOT* set while building
Vue.config.silent = !__DEV__;

Vue.use(<Vue.PluginObject<object>>(<unknown>CompositionAPI));

new Vue({
  render: (h) => h("frame", [h(Home)]),
}).$start();
