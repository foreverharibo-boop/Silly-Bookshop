package app.silly.bookshop;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;

/** Bookshop-owned prompts use the same bounded palette as the app toolbar. */
public final class BookshopDialog extends AlertDialog.Builder {
    private final Context context;
    private final int paper,side,ink,line,selected;
    private int dp(int n){return (int)(context.getResources().getDisplayMetrics().density*n+.5f);}
    public BookshopDialog(Context context){
        super(context);this.context=context;
        String name=context.getSharedPreferences("silly-bookshop",Context.MODE_PRIVATE).getString("toolbar-theme","light");
        String[] p=ToolbarTheme.colors(name);if(p==null)p=ToolbarTheme.colors("light");
        paper=Color.parseColor(p[0]);side=Color.parseColor(p[1]);ink=Color.parseColor(p[2]);line=Color.parseColor(p[3]);selected=Color.parseColor(p[4]);
    }
    private GradientDrawable shape(int fill,int radius){GradientDrawable d=new GradientDrawable();d.setColor(fill);d.setCornerRadius(dp(radius));d.setStroke(dp(1),line);return d;}
    @Override public AlertDialog.Builder setTitle(CharSequence value){TextView title=new TextView(context);title.setText(value);title.setTextSize(20);title.setTypeface(null,android.graphics.Typeface.BOLD);title.setTextColor(ink);title.setPadding(dp(24),dp(24),dp(24),dp(14));return super.setCustomTitle(title);}
    @Override public AlertDialog.Builder setItems(CharSequence[] items,DialogInterface.OnClickListener listener){
        ArrayAdapter<CharSequence> adapter=new ArrayAdapter<CharSequence>(context,android.R.layout.simple_list_item_1,items){
            @Override public View getView(int position,View recycled,ViewGroup parent){TextView t=new TextView(context);t.setText(getItem(position));t.setTextSize(14);t.setTextColor(ink);t.setGravity(android.view.Gravity.CENTER_VERTICAL);t.setPadding(dp(16),dp(13),dp(16),dp(13));t.setMinHeight(dp(48));t.setBackground(shape(side,12));return t;}
        };return super.setAdapter(adapter,listener);
    }
    @Override public AlertDialog create(){AlertDialog d=super.create();d.setOnShowListener(which->style(d));return d;}
    private void tint(View v){
        if(v instanceof TextView)((TextView)v).setTextColor(ink);
        if(v instanceof EditText){v.setBackgroundTintList(ColorStateList.valueOf(line));((EditText)v).setHintTextColor(ink);}
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)tint(((ViewGroup)v).getChildAt(i));
    }
    private void style(AlertDialog d){
        Window w=d.getWindow();if(w==null)return;w.setBackgroundDrawable(shape(paper,24));w.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);w.setDimAmount(.35f);
        int width=Math.min(dp(420),context.getResources().getDisplayMetrics().widthPixels-dp(36));w.setLayout(width,ViewGroup.LayoutParams.WRAP_CONTENT);tint(w.getDecorView());
        ListView list=d.getListView();if(list!=null){list.setDivider(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));list.setDividerHeight(dp(6));list.setPadding(dp(18),dp(2),dp(18),dp(18));list.setBackgroundColor(Color.TRANSPARENT);}
        for(int id:new int[]{AlertDialog.BUTTON_POSITIVE,AlertDialog.BUTTON_NEGATIVE,AlertDialog.BUTTON_NEUTRAL}){Button b=d.getButton(id);if(b==null)continue;b.setAllCaps(false);b.setTextSize(13);b.setTextColor(ink);b.setBackground(shape(id==AlertDialog.BUTTON_POSITIVE?selected:side,10));b.setPadding(dp(16),dp(8),dp(16),dp(8));}
    }
    public static void restyle(AlertDialog d,Context context){new BookshopDialog(context).style(d);}
}
