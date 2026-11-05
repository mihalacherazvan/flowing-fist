#!/bin/sh

# Set Session Name
SESSION="flowing-fist"

# Channel the middle pane signals once the database is up
DATABASE_READY="$SESSION-database-ready"

# Port the game server listens on (DEFAULT_SERVER_PORT in @flowing-fist/protocol)
SERVER_PORT="${PORT:-2567}"

# Start New Session with our name
tmux new-session -d -s $SESSION

# Three equal rows, the bottom one split into two columns
tmux split-window -v -t $SESSION:0
tmux split-window -v -t $SESSION:0
tmux select-layout -t $SESSION:0 even-vertical
tmux select-pane -t 2
tmux split-window -h -t $SESSION:0

# Middle: start the database, then tell the server pane it can go
tmux select-pane -t 1
tmux send-keys -t $SESSION:0 'clear' C-m "docker compose up -d --wait; tmux wait-for -S $DATABASE_READY" C-m

# Bottom left: game server, once the database is up
tmux select-pane -t 2
tmux send-keys -t $SESSION:0 'clear' C-m "tmux wait-for $DATABASE_READY && pnpm run server" C-m

# Bottom right: client, once the server is listening
tmux select-pane -t 3
tmux send-keys -t $SESSION:0 'clear' C-m "until nc -z localhost $SERVER_PORT; do sleep 1; done && pnpm run client" C-m

# Top: free shell, focused
tmux select-pane -t 0
tmux send-keys -t $SESSION:0 'clear' C-m

# Attach Session, on the Main window
tmux attach-session -t $SESSION:0
