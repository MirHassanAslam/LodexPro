"""
Browser Extension Installer for LoadifyPro
Automatically installs the browser extension and sets up native messaging.
"""
import os
import json
import shutil
import winreg
import subprocess
import sys
from pathlib import Path

class ExtensionInstaller:
    def __init__(self):
        self.project_dir = Path(__file__).parent
        self.extension_dir = self.project_dir / "browser_extension"
        self.chrome_extensions_dir = Path.home() / "AppData/Local/Google/Chrome/User Data/Default/Extensions"
        
    def create_extension_directory(self):
        """Create the browser extension directory structure."""
        self.extension_dir.mkdir(exist_ok=True)
        
        # Copy extension files
        files_to_copy = [
            ("manifest.json", "manifest.json"),
            ("content_script.js", "content_script.js"),
            ("background.js", "background.js")
        ]
        
        for src, dst in files_to_copy:
            src_path = self.project_dir / src
            dst_path = self.extension_dir / dst
            if src_path.exists():
                shutil.copy2(src_path, dst_path)
                print(f"✓ Copied {src} to extension directory")
            else:
                print(f"⚠ Warning: {src} not found")
    
    def create_native_host_manifest(self):
        """Create the native host manifest for Chrome."""
        manifest = {
            "name": "com.loadifypro.integration",
            "description": "Host for communicating with LoadifyPro",
            "path": str(self.project_dir / "run_host.bat"),
            "type": "stdio",
            "allowed_origins": [
                "chrome-extension://YOUR_EXTENSION_ID_HERE/"
            ]
        }
        
        # Write to Chrome's native messaging directory
        chrome_native_dir = Path.home() / "AppData/Local/Google/Chrome/User Data/NativeMessagingHosts"
        chrome_native_dir.mkdir(parents=True, exist_ok=True)
        
        manifest_path = chrome_native_dir / "com.loadifypro.integration.json"
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        print(f"✓ Created native host manifest at {manifest_path}")
        return manifest_path
    
    def install_extension(self):
        """Install the extension in Chrome (developer mode)."""
        print("\n🔧 Browser Extension Installation Instructions:")
        print("=" * 50)
        print("1. Open Chrome and go to chrome://extensions/")
        print("2. Enable 'Developer mode' (toggle in top right)")
        print("3. Click 'Load unpacked'")
        print(f"4. Select this folder: {self.extension_dir}")
        print("5. Copy the Extension ID from the extension card")
        print("6. Run this installer again with the Extension ID")
        print("\nExtension directory created at:", self.extension_dir)
    
    def update_extension_id(self, extension_id):
        """Update the native host manifest with the actual extension ID."""
        manifest_path = Path.home() / "AppData/Local/Google/Chrome/User Data/NativeMessagingHosts/com.loadifypro.integration.json"
        
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
            
            manifest["allowed_origins"] = [f"chrome-extension://{extension_id}/"]
            
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            
            print(f"✓ Updated native host manifest with Extension ID: {extension_id}")
        else:
            print("⚠ Native host manifest not found. Run installer first.")
    
    def test_installation(self):
        """Test if the installation is working."""
        print("\n🧪 Testing Installation:")
        print("=" * 30)
        
        # Check if native host manifest exists
        manifest_path = Path.home() / "AppData/Local/Google/Chrome/User Data/NativeMessagingHosts/com.loadifypro.integration.json"
        if manifest_path.exists():
            print("✓ Native host manifest found")
        else:
            print("❌ Native host manifest not found")
        
        # Check if extension files exist
        required_files = ["manifest.json", "content_script.js", "background.js"]
        for file in required_files:
            if (self.extension_dir / file).exists():
                print(f"✓ {file} found")
            else:
                print(f"❌ {file} missing")
        
        print("\n📋 Next Steps:")
        print("1. Install the extension in Chrome (see instructions above)")
        print("2. Start LoadifyPro application")
        print("3. Visit a video website (like YouTube)")
        print("4. Look for the 'Download with LoadifyPro' button on videos")

def main():
    installer = ExtensionInstaller()
    
    print("🚀 LoadifyPro Browser Extension Installer")
    print("=" * 40)
    
    # Create extension directory
    installer.create_extension_directory()
    
    # Create native host manifest
    installer.create_native_host_manifest()
    
    # Show installation instructions
    installer.install_extension()
    
    # Test installation
    installer.test_installation()
    
    # Ask for extension ID if provided
    if len(sys.argv) > 1:
        extension_id = sys.argv[1]
        installer.update_extension_id(extension_id)
        print(f"\n✅ Installation complete! Extension ID: {extension_id}")
    else:
        print("\n💡 To complete setup, run:")
        print(f"python {__file__} YOUR_EXTENSION_ID")

if __name__ == "__main__":
    main()
