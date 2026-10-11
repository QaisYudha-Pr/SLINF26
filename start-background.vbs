Set WshShell = CreateObject("WScript.Shell")
' 0 berarti berjalan tersembunyi (hidden background tanpa jendela CMD)
WshShell.Run "cmd.exe /c start.bat", 0, False
