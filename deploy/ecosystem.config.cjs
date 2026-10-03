{
  "apps": [
    {
      "name": "jieqi",
      "cwd": "双击改为实际路径,例如 /www/wwwroot/jieqi/server",
      "script": "dist/server.cjs",
      "env": { "PORT": 3190 },
      "instances": 1,
      "exec_mode": "fork",
      "max_memory_restart": "300M",
      "autorestart": true
    }
  ]
}
