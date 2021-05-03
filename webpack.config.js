const webpack = require("@nativescript/webpack");
const path = require("path");

module.exports = (env) => {
  webpack.init(env);

  // Learn how to customize:
  // https://docs.nativescript.org/webpack
  env.appComponents = env.appComponents || [];
  env.appComponents.push(
    path.resolve(__dirname, "app/hostCardEmulationService.ts")
  );

  return webpack.resolveConfig();
};
