// Crux Garden: the cloud (sign-in, the community, cloud songs) needs upstream's
// Firebase project. Without its keys in the build those controls are hidden.
export const cloudEnabled =
  typeof process.env.FIREBASE_API_KEY === "string" &&
  process.env.FIREBASE_API_KEY.length > 0
