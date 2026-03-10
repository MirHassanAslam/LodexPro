package main

import (
	"context"
	"embed"
	"os"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed assets/icon.ico
var iconBytes []byte

func main() {
	app := NewApp()

	// Channel so systray can signal the app to show the window
	showCh := make(chan struct{}, 1)
	quitCh := make(chan struct{}, 1)

	// Start system tray in background
	go systray.Run(
		func() {
			systray.SetIcon(iconBytes)
			systray.SetTitle("LodexPro")
			systray.SetTooltip("LodexPro — Download Manager")

			mOpen := systray.AddMenuItem("Open LodexPro", "Show the main window")
			systray.AddSeparator()
			mQuit := systray.AddMenuItem("Quit", "Exit LodexPro completely")

			go func() {
				for {
					select {
					case <-mOpen.ClickedCh:
						showCh <- struct{}{}
					case <-mQuit.ClickedCh:
						quitCh <- struct{}{}
					}
				}
			}()
		},
		func() {},
	)

	err := wails.Run(&options.App{
		Title:  "LodexPro",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			// Bridge tray signals once we have a context
			go func() {
				for {
					select {
					case <-showCh:
						runtime.WindowShow(ctx)
					case <-quitCh:
						systray.Quit()
						runtime.Quit(ctx)
					}
				}
			}()
		},
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			runtime.WindowHide(ctx)
			return true
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
		os.Exit(1)
	}
}
