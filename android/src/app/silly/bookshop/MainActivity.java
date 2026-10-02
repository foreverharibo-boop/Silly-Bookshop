package app.silly.bookshop;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import org.json.JSONObject;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.HttpAuthHandler;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebStorage;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.net.URI;

public final class MainActivity extends Activity {
    private static final String LIBRARY = "/api/plugins/silly-bookshop/";
    private WebView web;
    private LinearLayout root,toolbar;
    private Button[] toolbarButtons;
    private final Handler themeHandler=new Handler(Looper.getMainLooper());
    private boolean resumed=false,themePending=false;
    private String toolbarTheme="";
    private final Runnable themeTick=new Runnable(){@Override public void run(){if(!resumed)return;syncTheme();themeHandler.postDelayed(this,500);}};
    private volatile String server = "";
    private SharedPreferences prefs;
    private boolean loginRedirect = false;
    private boolean exporting=false;private int exportGeneration=0;private String exportServer="";
    private int dp(int n) {return (int)(getResources().getDisplayMetrics().density*n+.5f);}
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs=getSharedPreferences("silly-bookshop",MODE_PRIVATE);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        toolbar=new LinearLayout(this);toolbar.setPadding(dp(8),dp(5),dp(8),dp(5));toolbar.setBaselineAligned(false);toolbar.setGravity(Gravity.CENTER_VERTICAL);
        Button home=new Button(this);home.setText("홈화면");home.setTextSize(12);home.setOnClickListener(v->openHome());
        Button tools=new Button(this);tools.setText("도구");tools.setTextSize(12);tools.setOnClickListener(v->toolMenu());
        Button address=new Button(this);address.setText("서버 주소");address.setTextSize(12);address.setOnClickListener(v->configure());
        Button reload=new Button(this);reload.setText("화면\n새로고침");reload.setTextSize(11);reload.setOnClickListener(v->reloadPage());
        toolbarButtons=new Button[]{home,tools,address,reload};
        for(Button button:toolbarButtons){button.setGravity(Gravity.CENTER);button.setIncludeFontPadding(false);button.setAllCaps(false);button.setMinWidth(0);button.setMinimumWidth(0);button.setMinHeight(0);button.setMinimumHeight(0);button.setPadding(dp(3),0,dp(3),0);button.setStateListAnimator(null);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(42),1);lp.setMargins(dp(3),0,dp(3),0);toolbar.addView(button,lp);}
        root.addView(toolbar);applyTheme(prefs.getString("toolbar-theme","light"));
        WebView.setWebContentsDebuggingEnabled(false);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings s=web.getSettings();s.setUserAgentString(s.getUserAgentString()+" SillyBookshop/0.7.0");s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setMediaPlaybackRequiresUserGesture(true);s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if(Build.VERSION.SDK_INT>=26)s.setSafeBrowsingEnabled(true);
        s.setSavePassword(false);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !(!req.isForMainFrame() && isReaderFrame(req.getUrl().toString())) && !allowed(req.getUrl().toString());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                if(allowed(req.getUrl().toString())||(!req.isForMainFrame()&&isReaderFrame(req.getUrl().toString())))return null;
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setMessage("서버 인증서를 확인할 수 없습니다. 주소와 HTTPS 설정을 확인해 주세요.").setPositiveButton("확인",null).show());}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse response){
                if(req.isForMainFrame()&&response.getStatusCode()==403&&!loginRedirect&&req.getUrl().getPath().startsWith(LIBRARY)){
                    loginRedirect=true;view.loadUrl(server+"/login");
                    new AlertDialog.Builder(MainActivity.this).setMessage("실리 로그인이 필요할 수 있어요. 로그인한 다음 위쪽 ‘홈화면’을 눌러 주세요. IP 허용 목록에 막힌 경우에는 실리 설정을 확인해 주세요.").setPositiveButton("확인",null).show();
                }
            }
            @Override public void onReceivedHttpAuthRequest(WebView view,HttpAuthHandler handler,String host,String realm){
                final String challengedServer=server;
                try{if(!new URI(server).getHost().equalsIgnoreCase(host)){handler.cancel();return;}}catch(Exception e){handler.cancel();return;}
                LinearLayout form=new LinearLayout(MainActivity.this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(24),dp(8),dp(24),0);
                EditText user=new EditText(MainActivity.this);user.setHint("실리 기본 인증 아이디");user.setSingleLine(true);
                EditText password=new EditText(MainActivity.this);password.setHint("비밀번호");password.setSingleLine(true);password.setInputType(129);form.addView(user);form.addView(password);
                new AlertDialog.Builder(MainActivity.this).setTitle("실리 서버 로그인 · "+host).setView(form).setPositiveButton("로그인",(d,w)->{if(challengedServer.equals(server))handler.proceed(user.getText().toString(),password.getText().toString());else handler.cancel();}).setNegativeButton("취소",(d,w)->handler.cancel()).setOnCancelListener(d->handler.cancel()).show();
            }
            @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();syncTheme();}
        });
        server=prefs.getString("server","");
        try{if(!server.isEmpty())server=UrlPolicy.normalize(server);}catch(Exception e){server="";prefs.edit().remove("server").apply();}
        if(server.isEmpty())configure();else openLibrary();
    }
    private boolean isReaderFrame(String url){return "about:srcdoc".equals(url)||"about:blank".equals(url);}
    private boolean allowed(String url){
        return UrlPolicy.allowed(server,url);
    }
    private void openLibrary(){if(server.isEmpty()){configure();return;}loginRedirect=false;web.loadUrl(server+LIBRARY);}
    private boolean readerPage(){try{String url=web.getUrl();return url!=null&&allowed(url)&&LIBRARY.equals(new URI(url).getPath());}catch(Exception e){return false;}}
    private void openHome(){
        if(server.isEmpty()){configure();return;}
        if(readerPage()){web.evaluateJavascript("if(window.BookshopReady){window.dispatchEvent(new Event('bookshop-home'));}else{location.hash='home';}",null);return;}
        loginRedirect=false;web.loadUrl(server+LIBRARY+"#home");
    }
    private void reloadPage(){
        if(readerPage())web.evaluateJavascript("if(window.BookshopReady){window.dispatchEvent(new Event('bookshop-reload'));}else{location.reload();}",null);
        else web.reload();
    }
    private void syncTheme(){
        if(!resumed||themePending||web==null||!readerPage())return;
        themePending=true;final String source=server;
        // Read only a fixed theme identifier from our own top-level reader page.
        // No JavaScript interface or arbitrary native actions are exposed.
        web.evaluateJavascript("JSON.stringify({theme:document.documentElement.dataset.theme||'light',focus:document.documentElement.dataset.focus==='true'})",value->{
            themePending=false;if(!resumed||!source.equals(server)||!readerPage()||value==null||value.length()>160)return;
            try{Object parsed=new org.json.JSONTokener(value).nextValue();if(parsed instanceof String){JSONObject state=new JSONObject((String)parsed);applyTheme(state.optString("theme"));toolbar.setVisibility(state.optBoolean("focus",false)?View.GONE:View.VISIBLE);}}catch(Exception ignored){}
        });
    }
    private void applyTheme(String name){
        String[] palette=ToolbarTheme.colors(name);if(palette==null||name.equals(toolbarTheme))return;toolbarTheme=name;
        int paper=Color.parseColor(palette[0]),side=Color.parseColor(palette[1]),ink=Color.parseColor(palette[2]),line=Color.parseColor(palette[3]),selected=Color.parseColor(palette[4]);
        root.setBackgroundColor(paper);toolbar.setBackgroundColor(paper);
        for(Button button:toolbarButtons){GradientDrawable shape=new GradientDrawable();shape.setColor(side);shape.setCornerRadius(dp(8));shape.setStroke(dp(1),line);button.setBackground(new RippleDrawable(ColorStateList.valueOf(selected),shape,null));button.setTextColor(ink);}
        getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);
        int flags=getWindow().getDecorView().getSystemUiVisibility(),mask=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(ToolbarTheme.dark(name)?flags&~mask:flags|mask);
        prefs.edit().putString("toolbar-theme",name).apply();
    }
    private void toolMenu(){
        new AlertDialog.Builder(this).setTitle("책방 도구").setItems(new String[]{"테마·글꼴·읽기 설정","현재 대화 오프라인 보관","오프라인 책장 열기"},(d,w)->{if(w==0)openTools();else if(w==1)confirmOfflineSave();else startActivity(new Intent(this,OfflineActivity.class));}).show();
    }
    private void confirmOfflineSave(){
        if(exporting)return;
        if(!readerPage()){new AlertDialog.Builder(this).setMessage("온라인 책방에서 보관할 대화를 먼저 열어 주세요.").setPositiveButton("확인",null).show();return;}
        KeyguardManager k=(KeyguardManager)getSystemService(KEYGUARD_SERVICE);
        if(!k.isDeviceSecure()){new AlertDialog.Builder(this).setMessage("폰에 화면 잠금(PIN·패턴·비밀번호)을 설정한 뒤 사용할 수 있어요.").setPositiveButton("확인",null).show();return;}
        new AlertDialog.Builder(this).setTitle("이 대화를 폰에 보관할까요?").setMessage("저장된 번역·표시 정규식을 적용한 현재 대화를 암호화해서 보관해요. 서버의 삭제나 비밀번호 변경과 별개로 남으므로, 필요 없으면 오프라인 책장에서 삭제해 주세요.").setNegativeButton("취소",null).setPositiveButton("보관",(d,w)->{exportServer=server;Intent intent=k.createConfirmDeviceCredentialIntent("실리 책방","오프라인 보관을 위해 폰 잠금을 확인해 주세요.");if(intent!=null)startActivityForResult(intent,70);}).show();
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==70&&result==RESULT_OK&&readerPage()&&server.equals(exportServer))startExport();}
    private boolean exportValid(int ticket){return exporting&&ticket==exportGeneration&&!isFinishing()&&exportServer.equals(server)&&readerPage();}
    private void startExport(){
        exporting=true;int ticket=++exportGeneration;android.widget.Toast.makeText(this,"대화를 보관하고 있어요. 완료할 때까지 앱을 열어 두세요.",android.widget.Toast.LENGTH_LONG).show();
        web.evaluateJavascript("window.BookshopOfflineExport ? (window.BookshopOfflineExport.begin(),true) : false",value->{if(!exportValid(ticket))return;if(!"true".equals(value)){exportError("서버 플러그인을 먼저 업데이트해 주세요.");return;}pollExport(ticket,0);});
    }
    private void pollExport(int ticket,int tries){
        if(!exportValid(ticket))return;if(tries>180){exportError("보관 시간이 초과됐어요. 연결 상태를 확인해 주세요.");return;}
        web.evaluateJavascript("JSON.stringify(window.BookshopOfflineExport.status())",value->{if(!exportValid(ticket))return;try{JSONObject state=new JSONObject((String)new org.json.JSONTokener(value).nextValue());String status=state.optString("state");if(status.equals("error")){exportError(state.optString("message","보관하지 못했어요."));return;}if(status.equals("ready")){int length=state.getInt("length");if(length<1||length>18*1024*1024)throw new Exception();pullExport(ticket,length,new StringBuilder());return;}themeHandler.postDelayed(()->pollExport(ticket,tries+1),500);}catch(Exception e){exportError("보관 데이터를 확인할 수 없어요.");}});
    }
    private void pullExport(int ticket,int length,StringBuilder out){
        if(!exportValid(ticket))return;
        web.evaluateJavascript("window.BookshopOfflineExport.chunk("+out.length()+")",value->{if(!exportValid(ticket))return;try{Object parsed=new org.json.JSONTokener(value).nextValue();if(!(parsed instanceof String))throw new Exception();String part=(String)parsed;if(part.length()!=Math.min(32768,length-out.length()))throw new Exception();out.append(part);if(out.length()<length){pullExport(ticket,length,out);return;}
            web.evaluateJavascript("window.BookshopOfflineExport.clear()",null);String source=exportServer,json=out.toString();out.setLength(0);
            new Thread(()->{try{OfflineVault.save(getApplicationContext(),source,json);runOnUiThread(()->{if(ticket!=exportGeneration)return;exporting=false;android.widget.Toast.makeText(this,"오프라인 보관 완료 · 도구에서 오프라인 책장을 열어 보세요.",android.widget.Toast.LENGTH_LONG).show();});}catch(Exception e){runOnUiThread(()->{if(ticket==exportGeneration)exportError("보관하지 못했어요. 폰 잠금을 다시 확인하거나 보관함 용량을 확인해 주세요.");});}},"bookshop-offline-save").start();
        }catch(Exception e){exportError("보관 데이터를 확인할 수 없어요.");}});
    }
    private void exportError(String message){exporting=false;exportGeneration++;if(web!=null)web.evaluateJavascript("window.BookshopOfflineExport?.clear()",null);if(!isFinishing())new AlertDialog.Builder(this).setMessage(message).setPositiveButton("확인",null).show();}
    private void openTools(){
        if(server.isEmpty()){configure();return;}
        try{
            URI current=new URI(web.getUrl()==null?"":web.getUrl());
            if(allowed(current.toString())&&LIBRARY.equals(current.getPath())){
                web.evaluateJavascript("window.dispatchEvent(new Event('bookshop-open-tools'));",null);return;
            }
        }catch(Exception ignored){}
        loginRedirect=false;web.loadUrl(server+LIBRARY+"#tools");
    }
    private void configure(){
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(24),dp(12),dp(24),0);
        TextView help=new TextView(this);help.setText("실리를 여는 주소를 입력해 주세요.\n이 폰의 터먹스: http://127.0.0.1:8000\n다른 기기: 테일스케일 주소와 포트\n\n실리 서버와 책방 플러그인이 켜져 있어야 해요.");help.setTextSize(13);form.addView(help);
        EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(17);input.setText(server.isEmpty()?"http://127.0.0.1:8000":server);form.addView(input);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("실리 책방 연결").setView(form).setPositiveButton("연결",null).setNegativeButton("취소",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            try{final String next=UrlPolicy.normalize(input.getText().toString());dialog.dismiss();if(!next.equals(server)){web.stopLoading();web.loadUrl("about:blank");web.clearHistory();web.clearCache(true);WebStorage.getInstance().deleteAllData();server="";CookieManager.getInstance().removeAllCookies(done->{server=next;prefs.edit().putString("server",server).apply();openLibrary();});}else openLibrary();}
            catch(Exception e){input.setError("localhost·테일스케일 HTTP 주소 또는 HTTPS 서버 주소를 입력해 주세요.");}
        }));dialog.show();
    }
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onPause(){if(exporting){exporting=false;exportGeneration++;web.evaluateJavascript("window.BookshopOfflineExport?.clear()",null);}resumed=false;themeHandler.removeCallbacks(themeTick);super.onPause();web.onPause();CookieManager.getInstance().flush();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();resumed=true;themeHandler.removeCallbacks(themeTick);themeHandler.post(themeTick);}
    @Override protected void onDestroy(){resumed=false;themeHandler.removeCallbacksAndMessages(null);if(web!=null){root.removeView(web);web.destroy();}super.onDestroy();}
}
