import app.silly.bookshop.ToolbarTheme;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
public final class ToolbarThemeTest {
    public static void main(String[] args)throws Exception {
        String css=new String(Files.readAllBytes(Paths.get("server/public/style.css")),StandardCharsets.UTF_8);
        String[] keys={"paper","side","ink","line","selected"};
        for(String name:new String[]{"light","cream","rose","sage","cocoa","dark"}){
            String selector=name.equals("light")?":root{":":root[data-theme="+name+"]{";
            int start=css.indexOf(selector);
            if(start<0)throw new AssertionError(selector);
            String rule=css.substring(start,css.indexOf('}',start)).replace("#fff;","#ffffff;");
            String[] colors=ToolbarTheme.colors(name);
            for(int i=0;i<keys.length;i++)if(!rule.contains("--"+keys[i]+":"+colors[i]))throw new AssertionError(name+" "+keys[i]);
        }
        for(String name:new String[]{null,"","DARK","#ffffff","<script>","dark;alert(1)"})if(ToolbarTheme.colors(name)!=null)throw new AssertionError("Unknown theme accepted");
        if(!ToolbarTheme.dark("dark")||!ToolbarTheme.dark("cocoa")||ToolbarTheme.dark("cream"))throw new AssertionError("icon contrast");
        System.out.println("PASS: Android theme allowlist, icon contrast and web palette parity");
    }
}
