import * as vscode from 'vscode';

import { GitExtension } from './git';

const cp = require('child_process');

export function activate(context: vscode.ExtensionContext) {

	const provider = new ColorsViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ColorsViewProvider.viewType, provider));

	context.subscriptions.push(
		vscode.commands.registerCommand('diffViewerPanel.hideLeftSide', () => {
			provider.hideLeftSide();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('diffViewerPanel.expandAll', () => {
			provider.expandAll();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('diffViewerPanel.collapseAll', () => {
			provider.collapseAll();
		}));
}

class ColorsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'diffViewerPanel.diffView';

	private _view?: vscode.WebviewView;
	private console?: vscode.OutputChannel;
	private file?: vscode.Uri;
	private gitExtension = vscode.extensions?.getExtension<GitExtension>('vscode.git')?.exports;
	private git = this.gitExtension?.getAPI(1);

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		this.console = vscode.window.createOutputChannel("Diff panel");

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri,
                vscode.Uri.file(this._extensionUri + "/main"),
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'alert':
					vscode.window.showErrorMessage(message.text);
					return;
				case 'openFile':
					const line = Number(message.text);
					vscode.workspace.openTextDocument(this.file).then(doc => {
						vscode.window.showTextDocument(doc).then(editor => {
							const sel = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
							editor.selection = sel;
							vscode.commands
							.executeCommand("cursorMove", {to: "down", by: "line", value: line - 1})
							.then(() =>
								vscode.commands.executeCommand("cursorMove", {to: "right", by: "character", value: 0})
							);
						});
					});
					return;
			}
		});

		vscode.window.tabGroups.onDidChangeTabs((event: any) => {
			for (const tab of event.changed) {
				if (tab.input instanceof vscode.TabInputTextDiff) {
					vscode.window.tabGroups.close(tab);
					this.loadDiff(tab.input.modified);
				}
			}
		});

		vscode.workspace.onDidSaveTextDocument(doc => {
			if (this.file.path === doc.uri.path) {
				this.loadDiff(doc.uri);
			}
		});
	}

	public loadDiff(uri: vscode.Uri, expandAll: boolean = false) {
		const repo = this.git?.getRepository(uri);
		this.file = uri;
		if (!this._view) {
			return;
		}
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)?.uri?.fsPath;
		if (workspaceFolder) {
			workspaceFolder = workspaceFolder.substring(0, workspaceFolder.lastIndexOf('/')+1);
			this._view.title = uri.path.replace(workspaceFolder, "");
		}
		
		let option = "";
		if (expandAll) {
			option = "-U$(wc -l "+uri.path+" | cut -d' ' -f1)";
		}
		const promise = executeCommand("git -C "+repo.rootUri.path+" diff HEAD "+option+" " + uri.path);
		promise?.then(diff => {
				// TODO Faire viewsContainers : https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers avec liste fichier cliquables
				if (!diff) {
					executeCommand("git diff -- /dev/null " + uri.path)
						.then(diff => this._view.webview.postMessage({ diff }));
				} else {
					this._view?.webview.postMessage({ diff });
				}
			});
	}

	public hideLeftSide() {
		this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
		this._view?.webview.postMessage({ type: 'hideLeftSide' });
	}
	public expandAll() {
		this.loadDiff(this.file, true)
	}
	public collapseAll() {
		this.loadDiff(this.file)
	}

	public _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		const diffCss1 = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'github.min.css'));
		const diffCss2 = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'diff2html.min.css'));
		const diffJs = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'diff2html-ui.min.js'));

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<!--<meta http-equiv="Content-Security-Policy" content="default-src self; img-src vscode-resource:; script-src vscode-resource: 'self' 'unsafe-inline'; style-src vscode-resource: 'self' 'unsafe-inline'; "/>-->

				<meta name="viewport" content="width=device-width, initial-scale=1.0" charset="utf-8">

				<!--<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">-->

				<link rel="stylesheet" href="${diffCss1}" />
				<link
					rel="stylesheet"
					type="text/css"
					href="${diffCss2}"
				/>
				<link href="${styleMainUri}" rel="stylesheet">

				<title>Cat Colors</title>
			</head>
			<body>
				<div id="myDiffElement"></div>

				<script src="${diffJs}"></script>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function executeCommand(cmd: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out, stderr) => {
			if (stderr) {
				console.log(stderr);
				return reject(err);
			}
			return resolve(out);
		});
	});
}
