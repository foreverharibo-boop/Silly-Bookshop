'use strict';
const assert=require('node:assert/strict');
module.exports=async function(reader){
 await reader.locator('#off-first').click();await reader.locator('[data-index="0"]').waitFor();
 await reader.locator('[data-bookmark-index="0"]').click();await reader.locator('#off-note').fill('PRIVATE_BOOKMARK_102');await reader.locator('#off-mark-form button[type=submit]').click();await reader.locator('#off-mark-dialog').waitFor({state:'hidden'});
 assert.equal(await reader.locator('[data-bookmark-index="0"]').textContent(),'★');
 await reader.locator('#off-marks').click();await reader.getByRole('button',{name:'1번째 · PRIVATE_BOOKMARK_102',exact:true}).waitFor();await reader.locator('#off-bookmarks [data-close]').click();
 await reader.locator('#off-alias').click();await reader.locator('#off-alias-input').fill('PRIVATE_ALIAS_102');await reader.locator('#off-alias-form button[type=submit]').click();await reader.locator('#off-alias-dialog').waitFor({state:'hidden'});assert.equal(await reader.locator('#offline-title').textContent(),'PRIVATE_ALIAS_102');
 await reader.locator('#off-search').click();await reader.locator('#off-query').fill('another 34');
 // Native fixture uses "another"; web fixture uses TRANSLATION.
 const native=await reader.locator('body').evaluate(()=>location.host==='offline.silly-bookshop.invalid');if(!native)await reader.locator('#off-query').fill('TRANSLATION 34');
 await reader.locator('#off-search-form button[type=submit]').click();await reader.locator('#off-search-results button').first().click();await reader.locator('[data-index="34"].search-hit').waitFor();
 assert.equal(await reader.locator('#off-refresh').isDisabled(),true);
 assert.ok(await reader.locator('html').evaluate(el=>el.scrollWidth<=innerWidth));
 await reader.locator('#off-first').click();await reader.locator('[data-bookmark-index="0"]').click();await reader.locator('#off-remove-mark').click();await reader.locator('#off-mark-dialog').waitFor({state:'hidden'});assert.equal(await reader.locator('[data-bookmark-index="0"]').textContent(),'☆');
 console.log('PASS: offline bookmark create/list/remove, private alias, translation search/jump, unavailable server refresh, compact viewport.');
};
