package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"LodexPro/browser-host/messaging"
)

func main() {
	for {
		msg, err := messaging.ReadMessage(os.Stdin)
		if err != nil {
			break
		}

		// Forward to main app
		payload, _ := json.Marshal(msg)
		http.Post("http://localhost:8844/intercept", "application/json", bytes.NewBuffer(payload))
		
		// Echo for debugging
		messaging.SendMessage(os.Stdout, map[string]string{"status": "received"})
	}
}
