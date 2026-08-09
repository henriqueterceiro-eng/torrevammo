package com.vammo.colab;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra o plugin da bolinha flutuante ANTES do super.onCreate (exigência do Capacitor 6).
        registerPlugin(VammoBubblePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
