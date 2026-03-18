# Non-Technical Guide

This guide is for someone who wants to use the app but does not have a software background.

You do not need to know programming to use this project. You only need to install one tool, open a terminal window, and copy a few commands.

## What This App Does

The app helps you choose support champions during draft in League of Legends.

You tell it:

- which champions are on your team
- which champions are on the enemy team

It then fetches live data and shows a ranked list of support options.

## Before You Start

You need:

- a computer with internet access
- a web browser
- this project folder on your computer
- Node.js installed

## Step 1: Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **LTS** version.
3. Run the installer.
4. Keep the default options unless you have a reason to change them.

You only need to do this once per computer.

## Step 2: Open The Project Folder In A Terminal

### On macOS

1. Open the **Terminal** app.
2. Type `cd ` with a space after it.
3. Drag the project folder into the Terminal window.
4. Press `Enter`.

Example:

```bash
cd /Users/your-name/Downloads/pickban-prototype
```

### On Windows

1. Open the project folder in **File Explorer**.
2. Click the folder path bar at the top.
3. Type `powershell`.
4. Press `Enter`.

That opens a terminal already pointed at the correct folder.

## Step 3: Install The App Dependencies

In the terminal, run:

```bash
npm install
```

What this does:

- it downloads the parts the app needs before it can run

You usually only need to do this the first time, or again later if the project dependencies change.

## Step 4: Start The App

In the same terminal, run:

```bash
npm start
```

If everything is working, the app will start a local website on your computer.

## Step 5: Open The App In Your Browser

Open this address in your browser:

```text
http://localhost:3000
```

`localhost` means the app is running on your own computer, not on a public website.

## How To Use The App

1. Click the **Allied Champions** search box.
2. Type a champion name.
3. Click the correct champion from the suggestion list.
4. Repeat for the other allied champions you want to include.
5. If you want, use the **Assign lanes** section to mark allies as `Top`, `Jungle`, `Mid`, or `Bot`.
6. Add enemy champions in the **Enemy Champions** area.
7. Click **Fetch Suggestions**.
8. Read the ranked support list in the results section.

## What The Results Mean

- `SynergyScore`: how well a support works with your selected allies
- `CounterScore`: how well a support performs into your selected enemies
- `FinalScore`: the combined rank used to sort the list

In simple terms, the highest rows are the supports the app currently likes most for that draft.

## What The Limits Are

- Up to 4 allied champions
- Up to 5 enemy champions
- Ally lane assignment is optional
- At least 1 champion must be selected before fetching suggestions
- A champion can only appear once

## The Next Time You Use It

After the first setup, you normally only need these steps:

1. Open a terminal in the project folder.
2. Run:

```bash
npm start
```

3. Open `http://localhost:3000`.

## How To Stop The App

When you are done:

1. Go back to the terminal window.
2. Press `Ctrl+C`.

That stops the local server.

## Common Problems

### `npm` is not recognized

Node.js is usually missing or was not installed correctly. Reinstall Node.js from [https://nodejs.org](https://nodejs.org), then close and reopen the terminal.

### The browser page does not open

- Make sure you ran `npm start`
- Make sure the terminal is still open
- Make sure you typed `http://localhost:3000` correctly

### The app starts, but suggestions fail

The app needs internet access to fetch live data. Check your connection and try again.

### A message says port 3000 is already in use

Another app is already using that local address. If someone technical is helping you, ask them to start this app on a different port.

## If You Want More Detail

For a more technical explanation of how the app works, read [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md).
