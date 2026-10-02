package app.sili.library;
import java.net.URI;
import java.util.Locale;

public final class UrlPolicy {
    private UrlPolicy() {}
    static int port(URI u){return u.getPort()>=0?u.getPort():"https".equals(u.getScheme())?443:80;}
    public static String normalize(String value)throws Exception {
        URI u=new URI(value.trim());String scheme=u.getScheme(),host=u.getHost();
        if(host==null||u.getUserInfo()!=null||u.getRawAuthority().contains("%")||u.getQuery()!=null||u.getFragment()!=null||!("http".equals(scheme)||"https".equals(scheme)))throw new Exception("Invalid server URL");
        if(u.getRawPath()!=null&&!u.getRawPath().isEmpty()&&!u.getRawPath().equals("/")&&!u.getRawPath().equals("/api/plugins/sili-library/"))throw new Exception("Use the base server address");
        host=host.toLowerCase(Locale.ROOT);
        if("http".equals(scheme)&&!privateHost(host))throw new Exception("HTTPS or tunnel required");
        if(u.getPort()>65535||u.getPort()==0||u.getRawAuthority().endsWith(":"))throw new Exception("Invalid port");
        return scheme+"://"+host+(u.getPort()<0?"":":"+u.getPort());
    }
    public static boolean allowed(String server,String url){
        try{URI a=new URI(server),b=new URI(url);return a.getScheme().equals(b.getScheme())&&a.getHost().equalsIgnoreCase(b.getHost())&&port(a)==port(b)&&b.getUserInfo()==null&&!b.getRawAuthority().contains("%");}catch(Exception e){return false;}
    }
    static boolean privateHost(String h){
        if(h.equals("localhost")||h.equals("[::1]")||h.startsWith("[fd7a:115c:a1e0:"))return true;
        if(h.endsWith(".ts.net")&&h.length()>7)return true;
        String[] p=h.split("\\.");if(p.length!=4)return false;
        try{int[] a=new int[4];for(int i=0;i<4;i++){a[i]=Integer.parseInt(p[i]);if(a[i]<0||a[i]>255||!p[i].equals(Integer.toString(a[i])))return false;}
            return a[0]==127||(a[0]==100&&a[1]>=64&&a[1]<=127);
        }catch(Exception e){return false;}
    }
}
