package app.silly.bookshop;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
/** Authenticated encryption; filenames are bound as additional authenticated data. */
public final class VaultCipher {
 public static byte[] encrypt(SecretKey key,String id,byte[] plain)throws Exception{
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);c.updateAAD(id.getBytes(StandardCharsets.UTF_8));
  byte[] iv=c.getIV(),body=c.doFinal(plain);if(iv.length!=12)throw new IllegalStateException("IV length");
  byte[] out=new byte[13+body.length];out[0]=1;System.arraycopy(iv,0,out,1,12);System.arraycopy(body,0,out,13,body.length);return out;
 }
 public static byte[] decrypt(SecretKey key,String id,byte[] data)throws Exception{
  if(data.length<29||data[0]!=1)throw new IllegalArgumentException("Invalid vault");
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOfRange(data,1,13)));c.updateAAD(id.getBytes(StandardCharsets.UTF_8));return c.doFinal(data,13,data.length-13);
 }
 private VaultCipher(){}
}
