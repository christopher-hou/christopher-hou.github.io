# 🌎 Nation Game 🌎

A turn-based strategy game where players compete with AI opponents to conquer the world through resource management, military might, and diplomatic intrigue.

## About This Project

**Nation Game** was developed in **3.5 hours** as part of a **GitHub Copilot Hackathon**. The entire implementation was guided by:
- **[instructions.md](instructions.md)** - Complete game design specification  
- **[copilot-instructions.md](.github/copilot-instructions.md)** - Development guidelines for part-by-part implementation
- Iterative prompting via **ChatGPT** and **Claude** with **minimal human tweaking**

The human contribution focused exclusively on:
- Game design and ruleset specification
- UI/UX layout and styling decisions
- Balancing gameplay mechanics

**All code implementation was AI-generated**, following the detailed specifications in the markdown files. This project demonstrates how AI coding assistants can rapidly prototype complex, interactive applications.

## How to Play

### Starting Resources
- Each nation begins with **25 tiles**, **$10**, and **10 Political Capital (PC)**

### Core Mechanics

#### 🏗️ Projects
- Buy any number of **projects** per turn that you can afford
- Projects generate resources automatically each turn (money and/or PC)
- Progress from early-game to mid-game to late-game projects as your economy grows
- Maximum **5 projects per nation**
- You can destroy projects to free up slots

#### 💰 Economy
- Projects generate **income each turn**
- Extra territory beyond 25 tiles generates **1 money or 1 PC** per tile (randomly determined)
- Expand your territory through warfare and claiming unclaimed tiles

#### 🪖 Military
- Buy **Army units** for **$5 each**
- Declare war on neighboring nations for **5 PC**
- **Win wars by having more army than your opponent**
- Victory grants:
  - 50% of opponent's money and PC (divided among attackers)
  - Control of their territory
  - +1 project slot

#### 🗺️ Territory
- Start with 25 tiles per nation
- Claim unclaimed tiles adjacent to your territory
- Each tile beyond 25 generates bonus resources per turn
- Defeat enemies to absorb their territory

#### 💱 Diplomacy
- **Propose trades** with other nations (money and PC exchanges)
- Other nations will accept or reject based on fairness and current needs
- **Propose a draw** to end the game peacefully
- **Save and load** game states

### Victory
- **Win by conquering all other nations**, absorbing their territory and resources
- Alternatively, achieve a **draw** if all remaining nations agree

## Game Features

✅ Turn-based gameplay with AI opponents  
✅ Dynamic resource generation and economy  
✅ Real-time war resolution with territorial conquest  
✅ Diplomacy system with trade proposals  
✅ Project management with tier-based progression  
✅ Save/load functionality  
✅ Visual grid-based territory display  
✅ AI decision-making and strategic behavior  

## Technology

- **Pure HTML, CSS, and JavaScript** (no frameworks)
- Canvas-based grid rendering
- Browser localStorage for save/load functionality
- ES6+ modern JavaScript features

## Getting Started

Open `index.html` in a web browser to play the game locally, or visit the deployed version at the GitHub Pages link above.
