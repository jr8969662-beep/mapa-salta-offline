package ar.salta.mapa;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Mapa Salta: envoltorio de la web. Abre la página publicada, que se actualiza sola
 * (cada vez que se sube un cambio a GitHub, la app lo recibe la próxima vez que se abre).
 */
public class MainActivity extends Activity {
    static final String URL = "https://jr8969662-beep.github.io/mapa-salta-offline/";
    static final String CANAL = "avisos";
    WebView web;
    GeolocationPermissions.Callback geoCb;
    String geoOrigin;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#1e40af"));
        w.setNavigationBarColor(Color.WHITE);
        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MapaSaltaApp/1.0");

        web.addJavascriptInterface(new Puente(), "AndroidApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String sch = u.getScheme() == null ? "" : u.getScheme();
                String host = u.getHost() == null ? "" : u.getHost();
                if ((sch.equals("https") || sch.equals("http")) && host.endsWith("github.io")) return false;
                try {
                    Intent i = new Intent(sch.equals("tel") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, u);
                    startActivity(i);
                } catch (Exception e) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    v.loadData("<html><body style='font-family:sans-serif;text-align:center;padding:40px'>"
                        + "<h2>Sin conexi&oacute;n</h2><p>La primera vez hace falta internet para descargar el mapa. "
                        + "Despu&eacute;s funciona sin conexi&oacute;n.</p>"
                        + "<p><a href='" + URL + "'>Reintentar</a></p></body></html>", "text/html", "UTF-8");
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false);
                } else {
                    geoCb = cb; geoOrigin = origin;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest r) { r.deny(); }
        });

        pedirPermisos();
        if (b != null) web.restoreState(b); else web.loadUrl(URL);
    }

    void pedirPermisos() {
        java.util.ArrayList<String> p = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            p.add(Manifest.permission.ACCESS_FINE_LOCATION);
            p.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            p.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (geoCb != null) {
            boolean ok = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            geoCb.invoke(geoOrigin, ok, false);
            geoCb = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }

    /** Funciones nativas que la web puede usar (avisos de colectivos). */
    class Puente {
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() { public void run() {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }});
        }

        @JavascriptInterface
        public void notify(String titulo, String texto) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                Notification.Builder nb;
                if (Build.VERSION.SDK_INT >= 26) {
                    NotificationChannel ch = new NotificationChannel(CANAL, "Avisos de colectivos", NotificationManager.IMPORTANCE_HIGH);
                    ch.enableVibration(true);
                    nm.createNotificationChannel(ch);
                    nb = new Notification.Builder(MainActivity.this, CANAL);
                } else {
                    nb = new Notification.Builder(MainActivity.this);
                }
                nb.setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle(titulo).setContentText(texto)
                  .setAutoCancel(true).setDefaults(Notification.DEFAULT_ALL);
                nm.notify((int) (System.currentTimeMillis() % 100000), nb.build());
            } catch (Exception e) { }
        }
    }
}
