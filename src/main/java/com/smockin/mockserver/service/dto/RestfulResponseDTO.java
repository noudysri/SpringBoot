package com.smockin.mockserver.service.dto;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Created by mgallina.
 */
public class RestfulResponseDTO {

    private final int httpStatusCode;
    private final String responseContentType;
    private final String responseBody;
    private final Map<String, String> headers = new HashMap<>();

    public RestfulResponseDTO(final int httpStatusCode) {
        this.httpStatusCode = httpStatusCode;
        this.responseContentType = null;
        this.responseBody = null;
    }

    public RestfulResponseDTO(final int httpStatusCode, final String responseContentType, final String responseBody) {
        this.httpStatusCode = httpStatusCode;
        this.responseContentType = responseContentType;
        this.responseBody = responseBody;
    }

    public RestfulResponseDTO(final int httpStatusCode, final String responseContentType, final String responseBody, final Set<Map.Entry<String, String>> headers) {
        this.httpStatusCode = httpStatusCode;
        this.responseContentType = responseContentType;
        this.responseBody = responseBody;

        headers.stream().forEach(h ->
            this.headers.put(h.getKey(), h.getValue()));
    }

    public int getHttpStatusCode() {
        return httpStatusCode;
    }
    public String getResponseContentType() {
        return responseContentType;
    }
    public String getResponseBody() {
        return responseBody;
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

}
