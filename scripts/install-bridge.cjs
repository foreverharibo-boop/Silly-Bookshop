'use strict';
// Compatibility command: remove the retired bridge instead of installing an extension.
const path=require('node:path');
require('../server/migration.cjs').removeBridge(path.resolve(__dirname,'../../..')).then(()=>console.log('확장 탭 항목을 제거했어요. 실리 브라우저를 새로고침해 주세요.')).catch(e=>{console.error(e.message);process.exitCode=1;});
