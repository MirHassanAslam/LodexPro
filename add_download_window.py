import customtkinter as ctk
from tkinter import filedialog, messagebox
import os

class AddDownloadWindow(ctk.CTkToplevel):
    def __init__(self, master, translator, submit_callback):
        super().__init__(master)
        self.title("Add New Download")
        self.geometry("500x350")
        self.transients_to_master = True
        self.grab_set() # Make modal
        self.translator = translator
        self.submit_callback = submit_callback
        
        self.grid_columnconfigure(1, weight=1)
        self.configure(fg_color="#18181f")

        ctk.CTkLabel(self, text="Add New Download", font=ctk.CTkFont(size=20, weight="bold"), text_color="#3498db").grid(row=0, column=0, columnspan=3, pady=(20, 10), sticky="w", padx=20)
        
        ctk.CTkLabel(self, text="URL:", font=ctk.CTkFont(weight="bold"), text_color="#a0aab5").grid(row=1, column=0, padx=20, pady=10, sticky="e")
        self.url_entry = ctk.CTkEntry(self, placeholder_text="https://example.com/file.zip", fg_color="#21212a", border_color="#2c2c35")
        self.url_entry.grid(row=1, column=1, columnspan=2, padx=(0, 20), pady=10, sticky="ew")

        ctk.CTkLabel(self, text="Save To:", font=ctk.CTkFont(weight="bold"), text_color="#a0aab5").grid(row=2, column=0, padx=20, pady=10, sticky="e")
        self.dest_entry = ctk.CTkEntry(self, fg_color="#21212a", border_color="#2c2c35")
        self.dest_entry.insert(0, os.path.join(os.path.expanduser("~"), "Downloads"))
        self.dest_entry.grid(row=2, column=1, padx=(0, 5), pady=10, sticky="ew")
        
        ctk.CTkButton(self, text="Browse", width=80, fg_color="#2c3e50", hover_color="#34495e", command=self._browse).grid(row=2, column=2, padx=(0, 20), pady=10)

        ctk.CTkLabel(self, text="Quality:", font=ctk.CTkFont(weight="bold"), text_color="#a0aab5").grid(row=3, column=0, padx=20, pady=10, sticky="e")
        self.quality_var = ctk.StringVar(value="best")
        quality_menu = ctk.CTkOptionMenu(self, variable=self.quality_var, values=["best", "2160p", "1080p", "720p", "480p", "audio"], fg_color="#21212a", button_color="#2c3e50")
        quality_menu.grid(row=3, column=1, padx=(0, 20), pady=10, sticky="w")
        
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=4, column=0, columnspan=3, pady=(30, 20))
        ctk.CTkButton(btn_frame, text="Cancel", width=100, fg_color="transparent", border_width=1, border_color="#7f8c8d", text_color="#e0e0e0", hover_color="#2c3e50", command=self.destroy).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="Download", width=120, fg_color="#007BFF", hover_color="#0056b3", font=ctk.CTkFont(weight="bold"), command=self._submit).pack(side="left", padx=10)

        self.url_entry.focus()

    def _browse(self):
        f = filedialog.askdirectory()
        if f:
            self.dest_entry.delete(0, "end")
            self.dest_entry.insert(0, f)
            
    def _submit(self):
        url = self.url_entry.get().strip()
        dest = self.dest_entry.get().strip()
        q = self.quality_var.get()
        if not url or not dest:
            messagebox.showerror("Error", "URL and Destination are required.", parent=self)
            return
        self.submit_callback(url, dest, q)
        self.destroy()
