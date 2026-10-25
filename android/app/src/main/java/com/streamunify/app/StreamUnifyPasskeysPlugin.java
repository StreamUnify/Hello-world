package com.streamunify.app;

import android.os.Build;
import android.content.MutableContextWrapper;
import androidx.credentials.*;
import androidx.credentials.exceptions.*;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StreamUnifyPasskeys")
public class StreamUnifyPasskeysPlugin extends Plugin {
    private boolean pending = false;
    @PluginMethod public void isAvailable(PluginCall call) {
        JSObject result = new JSObject(); result.put("available", Build.VERSION.SDK_INT >= 28); call.resolve(result);
    }
    private JSObject options(PluginCall call, boolean registering) {
        JSObject options = call.getObject("options");
        String rp = options == null ? "" : registering ? options.optJSONObject("rp") == null ? "" : options.optJSONObject("rp").optString("id") : options.optString("rpId");
        if (!"www.streamunify.com".equals(rp)) { call.reject("Invalid relying party", "invalid_request"); return null; }
        if (pending) { call.reject("A passkey request is already open", "busy"); return null; }
        if (Build.VERSION.SDK_INT < 28) { call.reject("Passkeys require Android 9 or later", "unsupported"); return null; }
        pending = true; return options;
    }
    private void resolve(PluginCall call, String json) {
        pending = false;
        try { JSObject result = new JSObject(); result.put("credential", new JSObject(json)); call.resolve(result); }
        catch (Exception e) { call.reject("Invalid passkey response", "invalid_credential"); }
    }
    private void fail(PluginCall call, Exception error) {
        pending = false;
        call.reject("Passkey request did not complete", error instanceof CreateCredentialCancellationException || error instanceof GetCredentialCancellationException ? "cancelled" : "passkey_failed");
    }
    @PluginMethod public void register(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject options = options(call, true); if (options == null) return;
            try {
                CredentialManager.create(getContext()).createCredentialAsync(new MutableContextWrapper(getActivity()), new CreatePublicKeyCredentialRequest(options.toString()), null, ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
                    public void onResult(CreateCredentialResponse result) {
                        if (result instanceof CreatePublicKeyCredentialResponse) resolve(call, ((CreatePublicKeyCredentialResponse) result).getRegistrationResponseJson());
                        else fail(call, new Exception("Unexpected credential"));
                    }
                    public void onError(CreateCredentialException error) { fail(call, error); }
                });
            } catch (Exception error) { fail(call, error); }
        });
    }
    @PluginMethod public void authenticate(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject options = options(call, false); if (options == null) return;
            try {
                GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(new GetPublicKeyCredentialOption(options.toString())).build();
                CredentialManager.create(getContext()).getCredentialAsync(new MutableContextWrapper(getActivity()), request, null, ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    public void onResult(GetCredentialResponse result) {
                        if (result.getCredential() instanceof PublicKeyCredential) resolve(call, ((PublicKeyCredential) result.getCredential()).getAuthenticationResponseJson());
                        else fail(call, new Exception("Unexpected credential"));
                    }
                    public void onError(GetCredentialException error) { fail(call, error); }
                });
            } catch (Exception error) { fail(call, error); }
        });
    }
}
