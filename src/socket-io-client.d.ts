declare module "socket.io-client" {
  // socket.io-client는 JS/TS 환경에 따라 export 형태가 달라질 수 있어,
  // gum-frontend에서는 런타임 동작 중심이므로 넓게 any로 선언합니다.
  export const io: any;
  const _default: any;
  export default _default;
}

