package app.silly.bookshop;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import java.util.Arrays;
final class OfflineVault {
 static final int LIMIT=20*1024*1024;
 private static final String ALIAS="silly-bookshop-offline-v1";
 private static SecretKey key()throws Exception{
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias(ALIAS)){
   KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(true).setUserAuthenticationValidityDurationSeconds(300).build());gen.generateKey();
  }
  return (SecretKey)store.getKey(ALIAS,null);
 }
 private static File dir(Context ctx)throws IOException{File d=new File(ctx.getNoBackupFilesDir(),"offline-v1");if(!d.isDirectory()&&!d.mkdirs())throw new IOException("Vault directory");return d;}
 private static File file(Context ctx,String id)throws IOException{if(id==null||!id.matches("[a-f0-9]{64}"))throw new IOException("Invalid vault id");return new File(dir(ctx),id+".vault");}
 static synchronized String save(Context ctx,String server,String json)throws Exception{
  byte[] plain=null;
  try{
   JSONObject obj=new JSONObject(json);if(obj.optInt("schema")!=1||!"saved-display-v1".equals(obj.optString("displayPolicy")))throw new IOException("Snapshot version");
   JSONArray messages=obj.getJSONArray("messages");if(messages.length()>5000)throw new IOException("Message limit");
   obj.put("server",server);String id=hash(server+"\n"+obj.optString("scope")+"\n"+obj.getJSONObject("meta").getString("id"));obj.put("vaultId",id);
   plain=obj.toString().getBytes(StandardCharsets.UTF_8);if(plain.length>LIMIT)throw new IOException("Size limit");
   File target=file(ctx,id);long total=plain.length;int count=0;for(File f:dir(ctx).listFiles()){if(f.getName().endsWith(".vault")){count++;if(!f.equals(target))total+=f.length();}}
   if((!target.exists()&&count>=20)||total>128L*1024*1024)throw new IOException("보관함은 20개 대화 / 총 128MB까지 지원해요.");
   byte[] encrypted=VaultCipher.encrypt(key(),id,plain);AtomicFile atomic=new AtomicFile(target);FileOutputStream out=null;
   try{out=atomic.startWrite();out.write(encrypted);atomic.finishWrite(out);}catch(Exception e){if(out!=null)atomic.failWrite(out);throw e;}ctx.getSharedPreferences("offline-status-v2",Context.MODE_PRIVATE).edit().putString(id,new JSONObject().put("created",obj.optLong("created")).put("revision",obj.optString("revision")).toString()).apply();return id;
  }finally{if(plain!=null)Arrays.fill(plain,(byte)0);}
 }
 static synchronized String read(Context ctx,String id)throws Exception{
  File f=file(ctx,id);if(f.length()>LIMIT+1024)throw new IOException("Size limit");
  byte[] data;try(InputStream in=new AtomicFile(f).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>LIMIT+1024)throw new IOException("Size limit");}data=out.toByteArray();}
  byte[] plain=VaultCipher.decrypt(key(),id,data);try{return new String(plain,StandardCharsets.UTF_8);}finally{Arrays.fill(plain,(byte)0);}
 }
 static synchronized JSONArray list(Context ctx)throws Exception{
  JSONArray out=new JSONArray();File[] files=dir(ctx).listFiles();if(files==null)return out;
  for(File f:files){String name=f.getName();if(!name.matches("[a-f0-9]{64}\\.vault"))continue;String id=name.substring(0,64);
   try{JSONObject data=new JSONObject(read(ctx,id));out.put(new JSONObject().put("id",id).put("title",data.getJSONObject("meta").optString("alias", "").isEmpty()?data.getJSONObject("meta").optString("title"):data.getJSONObject("meta").optString("alias")).put("character",data.getJSONObject("meta").optString("character")).put("created",data.optLong("created")).put("server",data.optString("server")));}
   catch(android.security.keystore.UserNotAuthenticatedException e){throw e;}
   catch(Exception e){out.put(new JSONObject().put("id",id).put("title","열 수 없는 보관본 · 삭제 후 다시 보관해 주세요").put("character","").put("created",0));}
  }return out;
 }
 static synchronized void delete(Context ctx,String id)throws Exception{new AtomicFile(file(ctx,id)).delete();ctx.getSharedPreferences("offline-status-v2",Context.MODE_PRIVATE).edit().remove(id).apply();}
 static synchronized void clear(Context ctx)throws Exception{File[] files=dir(ctx).listFiles();if(files!=null)for(File f:files)if(f.getName().matches("[a-f0-9]{64}\\.vault(?:\\.bak|\\.new)?"))if(!f.delete())throw new IOException("Delete failed");KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);store.deleteEntry(ALIAS);ctx.getSharedPreferences("offline-status-v2",Context.MODE_PRIVATE).edit().clear().apply();}
 static JSONObject status(Context ctx,String server,JSONObject current)throws Exception{
  String chat=current.optString("id"),scope=current.optString("scope");if(chat.length()>4096||!scope.matches("[a-f0-9]{48}"))throw new IOException("Invalid status");
  String id=hash(server+"\n"+scope+"\n"+chat),saved=ctx.getSharedPreferences("offline-status-v2",Context.MODE_PRIVATE).getString(id,"");JSONObject result=new JSONObject().put("id",chat).put("scope",scope).put("exists",false);
  if(!saved.isEmpty()&&file(ctx,id).isFile()){JSONObject metadata=new JSONObject(saved);result.put("exists",true).put("created",metadata.optLong("created")).put("revision",metadata.optString("revision"));}return result;
 }
 private static String hash(String text)throws Exception{byte[] b=MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte v:b)out.append(String.format("%02x",v&255));return out.toString();}
}
