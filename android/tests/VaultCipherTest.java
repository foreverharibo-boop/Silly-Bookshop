import app.silly.bookshop.VaultCipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import java.util.Arrays;
import java.nio.charset.StandardCharsets;
public final class VaultCipherTest {
 public static void main(String[] args)throws Exception{
  KeyGenerator generator=KeyGenerator.getInstance("AES");generator.init(256);SecretKey key=generator.generateKey();byte[] text="비공개 대화와 메모".getBytes(StandardCharsets.UTF_8);
  byte[] a=VaultCipher.encrypt(key,"chat-a",text),b=VaultCipher.encrypt(key,"chat-a",text);
  if(Arrays.equals(a,b)||!Arrays.equals(VaultCipher.decrypt(key,"chat-a",a),text))throw new AssertionError("round trip / unique IV");
  for(int mode=0;mode<4;mode++){byte[] bad=a.clone();if(mode==0)bad[bad.length-1]^=1;if(mode==1)bad[1]^=1;boolean rejected=false;try{VaultCipher.decrypt(mode==3?generator.generateKey():key,mode==2?"chat-b":"chat-a",bad);}catch(Exception e){rejected=true;}if(!rejected)throw new AssertionError("tamper accepted "+mode);}
  System.out.println("PASS: AES-256-GCM roundtrip; randomized encryption; ciphertext/IV/AAD/wrong-key tamper rejection");
 }
}
