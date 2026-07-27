import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en-ZA">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>HT Auctions West Coast — Live Auctions</title>
        <meta name="description" content="HT Auctions West Coast — Live auction marketplace. Bid on vehicles, livestock, property, equipment and more." />

        {/* PWA */}
        <meta name="theme-color" content="#0D1B2A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HT Auctions" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192-v5.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512-v5.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192-v5.png" />

        {/* OneSignal Web Push */}
        <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer />
        <script dangerouslySetInnerHTML={{ __html: `
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          OneSignalDeferred.push(async function(OneSignal) {
            await OneSignal.init({
              appId: "b381ec59-c895-4341-aa33-9c5cd9f4d7bc",
              notifyButton: { enable: false },
              promptOptions: {
                slidedown: {
                  prompts: [{
                    type: "push",
                    autoPrompt: true,
                    text: {
                      actionMessage: "Get notified when HT Auctions goes live or schedules a new auction.",
                      acceptButton: "Allow",
                      cancelButton: "No thanks"
                    },
                    delay: { pageViews: 1, timeDelay: 5 }
                  }]
                }
              }
            });
          });
        `}} />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(e) {
                console.warn('SW registration failed:', e);
              });
            });
          }
        `}} />
      </body>
    </html>
  );
}
