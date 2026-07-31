package com.nhzhongguo.codexmax;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ConnectionUrlTest {
    @Test
    public void acceptsLanAddressWithToken() {
        ConnectionUrl.ParseResult result = ConnectionUrl.parse(
                "http://192.168.1.20:8787/?token=a%20b"
        );
        assertTrue(result.isValid());
        assertEquals(
                "http://192.168.1.20:8787/codex/status?token=a+b",
                result.value().statusUrl()
        );
    }

    @Test
    public void rejectsLoopbackAddress() {
        ConnectionUrl.ParseResult result = ConnectionUrl.parse(
                "http://127.0.0.1:8787/?token=test"
        );
        assertFalse(result.isValid());
        assertTrue(result.error().contains("局域网 IP"));
    }

    @Test
    public void rejectsMissingToken() {
        assertFalse(ConnectionUrl.parse("http://192.168.1.20:8787/").isValid());
    }

    @Test
    public void comparesOriginsUsingDefaultPorts() {
        ConnectionUrl value = ConnectionUrl.parse("http://192.168.1.20/?token=test").value();
        assertTrue(value.hasSameOrigin("http://192.168.1.20/codex/threads"));
        assertFalse(value.hasSameOrigin("https://192.168.1.20/codex/threads"));
    }

}
