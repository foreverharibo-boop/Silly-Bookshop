package app.sili.library;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
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
    private static final String LIBRARY = "/api/plugins/sili-library/";
    private WebView web;
    private LinearLayout root;
    private volatile String server = "";
    private SharedPreferences prefs;
    private boolean loginRedirect = false;
    private int dp(int n) {return (int)(getResources().getDisplayMetrics().density*n+.5f);}
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);
        prefs=getSharedPreferences("sili-library",MODE_PRIVATE);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        LinearLayout toolbar=new LinearLayout(this);toolbar.setPadding(dp(8),0,dp(8),0);toolbar.setBackgroundColor(Color.rgb(247,248,250));
        Button home=new Button(this);home.setText("책방");home.setTextSize(12);home.setOnClickListener(v->openLibrary());
        Button address=new Button(this);address.setText("서버 주소");address.setTextSize(12);address.setOnClickListener(v->configure());
        Button reload=new Button(this);reload.setText("새로고침");reload.setTextSize(12);reload.setOnClickListener(v->web.reload());
        toolbar.addView(home,new LinearLayout.LayoutParams(0,dp(44),1));toolbar.addView(address,new LinearLayout.LayoutParams(0,dp(44),1));toolbar.addView(reload,new LinearLayout.LayoutParams(0,dp(44),1));root.addView(toolbar);
        WebView.setWebContentsDebuggingEnabled(false);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setMediaPlaybackRequiresUserGesture(true);s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if(Build.VERSION.SDK_INT>=26)s.setSafeBrowsingEnabled(true);
        s.setSavePassword(false);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !allowed(req.getUrl().toString());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                if(allowed(req.getUrl().toString()))return null;
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setMessage("서버 인증서를 확인할 수 없습니다. 주소와 HTTPS 설정을 확인해 주세요.").setPositiveButton("확인",null).show());}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest req,WebResourceResponse response){
                if(req.isForMainFrame()&&response.getStatusCode()==403&&!loginRedirect&&req.getUrl().getPath().startsWith(LIBRARY)){
                    loginRedirect=true;view.loadUrl(server+"/login");
                    new AlertDialog.Builder(MainActivity.this).setMessage("실리 로그인이 필요할 수 있어요. 로그인한 다음 위쪽 ‘책방’을 눌러 주세요. IP 허용 목록에 막힌 경우에는 실리 설정을 확인해 주세요.").setPositiveButton("확인",null).show();
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
            @Override public void onPageFinished(WebView view,String url){CookieManager.getInstance().flush();}
        });
        server=prefs.getString("server","");
        try{if(!server.isEmpty())server=UrlPolicy.normalize(server);}catch(Exception e){server="";prefs.edit().remove("server").apply();}
        if(server.isEmpty())configure();else openLibrary();
    }
    private boolean allowed(String url){
        return UrlPolicy.allowed(server,url);
    }
    private void openLibrary(){if(server.isEmpty()){configure();return;}loginRedirect=false;web.loadUrl(server+LIBRARY);}
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
    @Override protected void onPause(){super.onPause();web.onPause();CookieManager.getInstance().flush();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(web!=null){root.removeView(web);web.destroy();}super.onDestroy();}
}
