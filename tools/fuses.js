// fuses.js — electron-builder afterPack 훅(v1.0.44). 패키지된 Electron 실행 파일의 퓨즈를 끈다/켠다.
//   · RunAsNode 끔            : ELECTRON_RUN_AS_NODE=1 로 앱 exe 를 「서명 없는 node」처럼 쓰는 길을 막는다
//   · NODE_OPTIONS 끔          : 환경 변수로 남의 코드를 앱 안에 끼워 넣는 길을 막는다
//   · --inspect 류 인자 끔     : 디버거 포트로 앱 메인 프로세스에 붙는 길을 막는다
//   · app.asar 에서만 앱 읽기 : resources/app 폴더를 끼워 넣어 바꿔치기하는 길을 막는다
//   쿠키 암호화·asar 무결성 검사는 켜지 않는다(쿠키 저장 형식이 바뀜 / electron-builder 24 가 윈도 무결성 값을 안 만든다).
//   맥은 이 훅 뒤에 sign-mac.js 가 번들 전체를 다시 서명한다(퓨즈를 바꾸면 기존 서명이 깨진다) — --prepackaged 단계에서는 훅이 안 돈다.
"use strict";
const path = require("path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

module.exports = async function afterPack(ctx) {
  const name = ctx.packager.appInfo.productFilename;
  const mac = ctx.electronPlatformName === "darwin";
  const target = mac ? path.join(ctx.appOutDir, name + ".app") : path.join(ctx.appOutDir, name + ".exe");
  await flipFuses(target, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: mac,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
  console.log("  • fuses applied  " + target);
};
