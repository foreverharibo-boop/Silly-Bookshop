package app.silly.bookshop;

/** Only these built-in theme names may affect Android chrome. */
public final class ToolbarTheme {
    private ToolbarTheme() {}
    public static boolean dark(String name){return "dark".equals(name)||"cocoa".equals(name);}
    public static String[] colors(String name){
        if(name==null)return null;
        switch(name){
            case "light":return new String[]{"#ffffff","#f7f8fa","#282e39","#e8ebf0","#eaf0fa"};
            case "cream":return new String[]{"#fffbf3","#f4eee2","#433c33","#e7ddcc","#ecdfc8"};
            case "rose":return new String[]{"#fff9fb","#f7edf1","#493640","#ead9e1","#f0dce5"};
            case "sage":return new String[]{"#f8fbf7","#ecf2e9","#344437","#dbe5d6","#dbe8d5"};
            case "cocoa":return new String[]{"#25211f","#302a26","#f0e5d7","#493e35","#514234"};
            case "dark":return new String[]{"#191c22","#20242c","#e5e9f1","#303744","#2c3a53"};
            default:return null;
        }
    }
}
