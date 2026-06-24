@echo off
set /p file="Enter Filename: "
xcopy ".\data" ".\temp\data" /q /s /y /c /e
mabi-pack2.exe pack -i .\temp\ -o .%file%.it -k "})wWb4?-sVGHNoPKpc"
rmdir /q /s  .\temp\