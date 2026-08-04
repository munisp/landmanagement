const base = require("./app.json");

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
const { eas: _legacyEasConfiguration, ...baseExtra } = base.expo.extra ?? {};

module.exports = () => ({
  expo: {
    ...base.expo,
    extra: {
      ...baseExtra,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  },
});
