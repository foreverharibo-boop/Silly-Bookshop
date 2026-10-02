'use strict';
const path=require('node:path'),migration=require('../server/migration.cjs');
(async()=>{
 console.log('실리 서버를 중지한 상태에서 실행해 주세요.');
 const result=await migration.install(path.resolve(__dirname,'..'));
 console.log('Silly Bookshop 이전 완료 · plugins/silly-bookshop');
 console.log('비밀번호·읽던 위치 데이터 이전: '+result.migrated+'개 계정');
 console.log(result.bridge?'이전 확장 탭 항목을 제거하고 백업했어요. 실리 브라우저를 새로고침해 주세요.':'남아 있는 화면 연동 확장이 없어요.');
 console.log('다음으로 실리 서버를 다시 시작하고 새 Silly Bookshop APK를 연결해 주세요.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
