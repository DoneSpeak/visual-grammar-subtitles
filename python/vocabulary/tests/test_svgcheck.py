import pytest

from vocabulary.svgcheck import SvgValidationError, check_svg_bytes

SAFE = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path d="M0 0h72v72H0z"/></svg>'


def test_safe_svg_passes():
    check_svg_bytes(SAFE, "safe.svg")


@pytest.mark.parametrize(
    "payload",
    [
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><g onload="alert(1)"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/x.svg#a"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
        b'<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
        b'<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x);</style></svg>',
        b"not xml",
    ],
)
def test_unsafe_svg_rejected(payload):
    with pytest.raises(SvgValidationError):
        check_svg_bytes(payload, "bad.svg")


def test_local_fragment_reference_allowed():
    payload = b'<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape"/></svg>'
    check_svg_bytes(payload, "ok.svg")
