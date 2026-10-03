package app.silly.bookshop;
import android.app.*;
import android.content.Intent;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import android.view.*;
import android.graphics.Color;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Private, authenticated, network-free reader. Never exports a native JS interface. */
public final class OfflineActivity extends Activity {
 private static final String ORIGIN="https://offline.silly-bookshop.invalid";
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final Handler handler=new Handler(Looper.getMainLooper());
 private LinearLayout root,bar;private WebView web;private volatile String snapshot="";
 private boolean authPending=true,unlocked=false;private int generation=0;
 private final Runnable expire=()->lock();
 private final Runnable chromeTick=new Runnable(){public void run(){if(!unlocked)return;syncChrome();handler.postDelayed(this,500);}};
 private int dp(int n){return (int)(getResources().getDisplayMetrics().density*n+.5f);}
 @Override public void onCreate(Bundle b){super.onCreate(b);root=new LinearLayout(this);root.setOrientation(1);root.setPadding(dp(12),dp(12),dp(12),dp(12));root.setBackgroundColor(Color.WHITE);root.setFitsSystemWindows(true);setContentView(root);TextView hint=new TextView(this);hint.setText("오프라인 책장 잠금을 확인하고 있어요.");root.addView(hint);
  KeyguardManager k=(KeyguardManager)getSystemService(KEYGUARD_SERVICE);if(!k.isDeviceSecure()){authPending=false;new AlertDialog.Builder(this).setMessage("오프라인 보관에는 폰의 화면 잠금(PIN·패턴·비밀번호)이 필요해요.").setPositiveButton("확인",(d,w)->finish()).setOnCancelListener(d->finish()).show();return;}
  Intent intent=k.createConfirmDeviceCredentialIntent("실리 책방","오프라인 책장을 열려면 폰 잠금을 확인해 주세요.");if(intent==null){finish();return;}startActivityForResult(intent,1);
 }
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==1){authPending=false;if(result!=RESULT_OK){finish();return;}unlocked=true;handler.post(chromeTick);handler.postDelayed(expire,5*60*1000);showList();}}
 private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setTextSize(12);b.setOnClickListener(v->action.run());return b;}
 private void wipeWeb(){snapshot="";if(web!=null){web.stopLoading();root.removeView(web);web.loadUrl("about:blank");web.clearHistory();web.destroy();web=null;}}
 private void header(){root.removeAllViews();bar=new LinearLayout(this);bar.setBaselineAligned(false);bar.addView(button("목록",()->showList()),new LinearLayout.LayoutParams(0,dp(44),1));bar.addView(button("전체 비우기",()->confirmClear()),new LinearLayout.LayoutParams(0,dp(44),1));bar.addView(button("잠그기",()->lock()),new LinearLayout.LayoutParams(0,dp(44),1));root.addView(bar);applyChrome(getSharedPreferences("silly-bookshop",MODE_PRIVATE).getString("toolbar-theme","light"),false);}
 private void showList(){if(!unlocked)return;int ticket=++generation;wipeWeb();header();TextView busy=new TextView(this);busy.setText("보관한 이야기를 읽고 있어요…");root.addView(busy);worker.execute(()->{try{JSONArray list=OfflineVault.list(this);runOnUiThread(()->{if(!unlocked||ticket!=generation)return;root.removeView(busy);ScrollView scroll=new ScrollView(this);LinearLayout rows=new LinearLayout(this);rows.setOrientation(1);scroll.addView(rows);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));if(list.length()==0){TextView empty=new TextView(this);empty.setPadding(dp(12),dp(24),dp(12),0);empty.setText("보관한 대화가 없어요.\n온라인에서 대화를 열고 상단 도구 → 현재 대화 오프라인 보관을 눌러 주세요.");rows.addView(empty);}for(int i=0;i<list.length();i++){JSONObject item=list.optJSONObject(i);String id=item.optString("id");LinearLayout row=new LinearLayout(this);row.setBaselineAligned(false);row.setGravity(Gravity.CENTER_VERTICAL);Button open=button(item.optString("character")+" · "+item.optString("title")+"\n"+item.optString("server")+"\n보관됨 · "+(item.optLong("created")>0?java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT,java.text.DateFormat.SHORT).format(new java.util.Date(item.optLong("created"))):"날짜 확인 불가"),()->open(id));open.setAllCaps(false);open.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);open.setMinHeight(dp(64));row.addView(open,new LinearLayout.LayoutParams(0,-2,1));Button remove=button("삭제",()->confirmDelete(id));remove.setGravity(Gravity.CENTER);LinearLayout.LayoutParams removeParams=new LinearLayout.LayoutParams(dp(72),-1);removeParams.setMargins(dp(4),0,0,0);row.addView(remove,removeParams);rows.addView(row,new LinearLayout.LayoutParams(-1,-2));}});}catch(Exception e){runOnUiThread(()->error("폰 잠금을 다시 확인해 주세요. 보관함을 열지 못했어요."));}});}
 private void open(String id){int ticket=++generation;worker.execute(()->{try{String data=OfflineVault.read(this,id);runOnUiThread(()->{if(!unlocked||ticket!=generation)return;wipeWeb();header();snapshot=data;web=new WebView(this);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setBlockNetworkLoads(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setCacheMode(WebSettings.LOAD_NO_CACHE);s.setJavaScriptCanOpenWindowsAutomatically(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);web.setWebViewClient(new WebViewClient(){
 @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
 @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){try{
  android.net.Uri u=r.getUrl();if(!r.isForMainFrame()&&("about:srcdoc".equals(u.toString())||"about:blank".equals(u.toString())))return null;if(!"https".equals(u.getScheme())||!"offline.silly-bookshop.invalid".equals(u.getHost())||u.getPort()!=-1||!"GET".equals(r.getMethod()))return response("text/plain",new byte[0],403);
  String path=u.getPath();if("/snapshot".equals(path))return response("application/json",snapshot.getBytes(StandardCharsets.UTF_8),200);
  String asset=null,mime="text/plain";if("/".equals(path)){asset="offline/index.html";mime="text/html";}else if(Arrays.asList("/offline.js","/rich.js").contains(path)){asset="offline"+path;mime="application/javascript";}else if(Arrays.asList("/offline.css","/style.css").contains(path)){asset="offline"+path;mime="text/css";}else if(path.matches("/api/plugins/silly-bookshop/fonts/(NanumGothic|NanumMyeongjo|GowunBatang)-(Regular|Bold)\\.woff2")||path.equals("/api/plugins/silly-bookshop/fonts/RIDIBatang-Regular.woff2")){asset="offline/fonts/"+path.substring(path.lastIndexOf('/')+1);mime="font/woff2";}else if(path.matches("/fonts/(NanumGothic|NanumMyeongjo|GowunBatang)-(Regular|Bold)\\.woff2")||path.equals("/fonts/RIDIBatang-Regular.woff2")){asset="offline"+path;mime="font/woff2";}
  if(asset==null)return response("text/plain",new byte[0],403);return new WebResourceResponse(mime,"UTF-8",200,"OK",headers(),getAssets().open(asset));
 }catch(Exception e){return response("text/plain",new byte[0],403);}}
 });root.addView(web,new LinearLayout.LayoutParams(-1,0,1));web.loadUrl(ORIGIN+"/");});}catch(Exception e){runOnUiThread(()->error("보관본을 열지 못했어요. 다시 잠금을 풀거나 온라인에서 다시 보관해 주세요."));}});}
 private void syncChrome(){if(web==null)return;final WebView source=web;source.evaluateJavascript("JSON.stringify({theme:document.documentElement.dataset.theme||'light',focus:document.documentElement.dataset.focus==='true'})",value->{if(!unlocked||web!=source||value==null||value.length()>160)return;try{JSONObject s=new JSONObject((String)new JSONTokener(value).nextValue());applyChrome(s.optString("theme"),s.optBoolean("focus",false));}catch(Exception ignored){}});}
 private void applyChrome(String theme,boolean focus){String[] colors=ToolbarTheme.colors(theme);if(colors==null)return;root.setBackgroundColor(Color.parseColor(colors[0]));bar.setBackgroundColor(Color.parseColor(colors[0]));bar.setVisibility(focus?View.GONE:View.VISIBLE);for(int i=0;i<bar.getChildCount();i++){View child=bar.getChildAt(i);if(child instanceof Button){child.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.parseColor(colors[1])));((Button)child).setTextColor(Color.parseColor(colors[2]));}}}
 private Map<String,String> headers(){Map<String,String> h=new HashMap<>();h.put("Cache-Control","no-store");h.put("X-Content-Type-Options","nosniff");h.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");return h;}
 private WebResourceResponse response(String mime,byte[] data,int status){return new WebResourceResponse(mime,"UTF-8",status,status==200?"OK":"Blocked",headers(),new ByteArrayInputStream(data));}
 private void confirmDelete(String id){new AlertDialog.Builder(this).setMessage("이 폰의 오프라인 사본을 삭제할까요? 실리 원본은 그대로 남아요.").setPositiveButton("삭제",(d,w)->worker.execute(()->{try{OfflineVault.delete(this,id);runOnUiThread(()->showList());}catch(Exception e){runOnUiThread(()->error("삭제하지 못했어요."));}})).setNegativeButton("취소",null).show();}
 private void confirmClear(){new AlertDialog.Builder(this).setMessage("오프라인 사본 전체와 암호화 키를 삭제할까요? 실리 원본은 지우지 않아요.").setPositiveButton("전체 삭제",(d,w)->{wipeWeb();worker.execute(()->{try{OfflineVault.clear(this);runOnUiThread(()->showList());}catch(Exception e){runOnUiThread(()->error("전체 삭제하지 못했어요."));}});}).setNegativeButton("취소",null).show();}
 private void error(String message){if(!isFinishing())new AlertDialog.Builder(this).setMessage(message).setPositiveButton("닫기",(d,w)->lock()).show();}
 private void lock(){unlocked=false;generation++;handler.removeCallbacksAndMessages(null);wipeWeb();root.removeAllViews();finish();}
 @Override protected void onPause(){super.onPause();if(!authPending){root.setVisibility(View.INVISIBLE);if(unlocked)lock();}}
 @Override public void onBackPressed(){if(web!=null)showList();else lock();}
 @Override protected void onDestroy(){unlocked=false;generation++;handler.removeCallbacksAndMessages(null);wipeWeb();worker.shutdownNow();super.onDestroy();}
}
