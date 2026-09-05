export class ThrottlerGuard {
  canActivate() { return true; }
}
export class ThrottlerModule {
  static forRoot() { return { module: ThrottlerModule }; }
}
export const Throttle = () => () => {};
