export class ThrottlerGuard {
  canActivate() { return true; }
}
export class ThrottlerModule {
  // Jest ESM cannot load this CJS/ESM dependency cycle. Native HTTP verification uses the real module.
  static forRootAsync() { return { module: ThrottlerModule }; }
  static forRoot() { return { module: ThrottlerModule }; }
}
export const Throttle = () => () => {};
