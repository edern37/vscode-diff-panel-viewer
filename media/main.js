// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

	vscode.setState({ hideLeft: true });

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
		if (event?.data?.type === "hideLeftSide") {
			vscode.setState({ hideLeft: !vscode.getState().hideLeft });
			hideLeft();
		} else if (event?.data?.diff) {
			var elements = document.getElementsByTagName("body");
			elements[0].style.backgroundColor = "white";
			elements[0].style.color = "white";

			var targetElement = document.getElementById('myDiffElement');
			var configuration = {
				drawFileList: false,
				fileListToggle: false,
				fileListStartVisible: false,
				fileContentToggle: false,
				matching: 'lines',
				outputFormat: 'side-by-side', // line-by-line
				synchronisedScroll: true,
				highlight: true,
				renderNothingWhenEmpty: false,
				diffMaxLineLength: 1000
			};
			var diff2htmlUi = new Diff2HtmlUI(targetElement, event.data.diff, configuration);
			diff2htmlUi.draw();
			diff2htmlUi.highlightCode();
			hideLeft();
			//document.querySelector('html').style.filter = 'invert(10%)';
		}

    });

	window.addEventListener('click', event => {
		if (!window.event?.ctrlKey) {
			return;
		}
		var tr = event.target.closest('tr');
		if (tr) {
			var td = tr.getElementsByTagName('td')[0];
			vscode.postMessage({
				command: 'openFile',
				text: td.innerHTML.trim()
			});
		}
	});

	function hideLeft() {
		var elements = document.getElementsByClassName("d2h-file-side-diff");
		if (!vscode.getState().hideLeft) {
			elements[0].style.display = "block";
			elements[0].style.visibility = "visible";
			elements[1].style.width = "50%";
		} else {
			elements[0].style.display = "none";
			elements[0].style.visibility = "hidden";
			elements[1].style.width = "100%";
		}
	}

}());


