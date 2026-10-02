import app.silly.bookshop.UrlPolicy;
public final class UrlPolicyTest {
    static void check(boolean value,String label){if(!value)throw new AssertionError(label);}
    public static void main(String[] args)throws Exception {
        String[] accepted={"http://127.0.0.1:8000","http://localhost:8000","http://100.64.1.2:8000","http://phone.test.ts.net:8000","https://example.org","http://[::1]:8000","http://[fd7a:115c:a1e0::1]:8000"};
        for(String url:accepted)check(!UrlPolicy.normalize(url).isEmpty(),url);
        String[] denied={"http://192.168.0.2:8000","http://10.0.0.2","http://example.org","http://100.63.1.2","http://100.128.1.2","http://127.1","http://127.000.0.1","http://localhost.evil.invalid","http://foo.ts.net.evil.invalid","https://user:pass@example.org","javascript:alert(1)","file:///etc/passwd","content://private","https://example.org:0","https://example.org:99999","https://example.org?x=1","https://example.org/other-prefix","http://127.0.0.1\\@evil.invalid"};
        for(String url:denied){boolean rejected=false;try{UrlPolicy.normalize(url);}catch(Exception e){rejected=true;}check(rejected,url);}
        String server="https://example.org";
        check(UrlPolicy.allowed(server,"https://example.org:443/api/plugins/silly-bookshop/"),"same origin");
        for(String url:new String[]{"https://example.org.evil.invalid/","https://example.org@evil.invalid/","https://example.org:444/","http://example.org/","file:///etc/passwd","https://user@example.org/"})check(!UrlPolicy.allowed(server,url),url);
        System.out.println("PASS: Android URL allow/deny policy and same-Origin checks");
    }
}
