package com.streamunify.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(StreamUnifyPasskeysPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
