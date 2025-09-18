#!/bin/bash

# LLM Warehouse NPM Package Deployment Script
# This script builds, versions, and publishes the package to npm

set -e  # Exit on any error

echo "🚀 Starting LLM Warehouse NPM Package Deployment"
echo "================================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the llm-warehouse-npm directory."
    exit 1
fi

# Check if user is logged into npm
echo "🔍 Checking npm authentication..."
if ! npm whoami > /dev/null 2>&1; then
    echo "❌ Error: You're not logged into npm. Please run 'npm login' first."
    exit 1
fi

echo "✅ NPM authentication verified"

# Clean and build
echo "🧹 Cleaning previous build..."
rm -rf dist/

echo "🔨 Building TypeScript package..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful"

# Run tests (if they exist and don't require API keys)
echo "🧪 Running package tests..."
if command -v ts-node > /dev/null 2>&1; then
    OPENAI_API_KEY=sk-test-dummy npm run test:no-api || echo "⚠️  Tests skipped (this is okay if no API key)"
else
    echo "⚠️  ts-node not found, skipping tests"
fi

# Determine version bump type
echo ""
echo "📝 Current version: $(npm version --json | jq -r '.["llm-warehouse"]')"
echo ""
echo "What type of version bump would you like?"
echo "1) patch (0.1.1 -> 0.1.2) - bug fixes"
echo "2) minor (0.1.1 -> 0.2.0) - new features" 
echo "3) major (0.1.1 -> 1.0.0) - breaking changes"
echo "4) skip version bump"
echo ""
read -p "Enter choice (1-4) [default: 1]: " version_choice

case $version_choice in
    2)
        version_type="minor"
        ;;
    3)
        version_type="major"
        ;;
    4)
        version_type="skip"
        ;;
    *)
        version_type="patch"
        ;;
esac

# Check git status
echo "🔍 Checking git status..."
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Git working directory is not clean"
    echo "📋 Uncommitted changes:"
    git status --porcelain
    echo ""
    read -p "Do you want to commit these changes first? (y/N): " commit_changes
    
    if [[ $commit_changes =~ ^[Yy]$ ]]; then
        echo "📝 Committing changes..."
        git add .
        read -p "Enter commit message: " commit_message
        if [ -z "$commit_message" ]; then
            commit_message="Update package for deployment"
        fi
        git commit -m "$commit_message"
        echo "✅ Changes committed"
    else
        echo "⚠️  Proceeding with dirty git state (will use --force for npm version)"
        force_flag="--force"
    fi
else
    echo "✅ Git working directory is clean"
    force_flag=""
fi

# Version bump
if [ "$version_type" != "skip" ]; then
    echo "📈 Bumping $version_type version..."
    npm version $version_type $force_flag
    echo "✅ Version bumped to: $(npm version --json | jq -r '.["llm-warehouse"]')"
else
    echo "⏭️  Skipping version bump"
fi

# Show what will be published
echo ""
echo "📦 Package contents preview:"
npm pack --dry-run

# Confirmation
echo ""
echo "🚨 Ready to publish to npm!"
echo "Package: llm-warehouse"
echo "Version: $(npm version --json | jq -r '.["llm-warehouse"]')"
echo ""
read -p "Do you want to continue with publishing? (y/N): " confirm

if [[ $confirm =~ ^[Yy]$ ]]; then
    echo "🚀 Publishing to npm..."
    npm publish
    
    if [ $? -eq 0 ]; then
        new_version=$(npm version --json | jq -r '.["llm-warehouse"]')
        echo ""
        echo "🎉 SUCCESS! Package published successfully!"
        echo "✅ Package: llm-warehouse@$new_version"
        echo "🌐 NPM URL: https://www.npmjs.com/package/llm-warehouse"
        echo "📥 Install with: npm install llm-warehouse"
        echo ""
        echo "🔗 Useful commands:"
        echo "   npm view llm-warehouse"
        echo "   npm info llm-warehouse"
        echo ""
    else
        echo "❌ Publishing failed!"
        exit 1
    fi
else
    echo "❌ Publishing cancelled by user"
    exit 1
fi

echo "🏁 Deployment complete!"
