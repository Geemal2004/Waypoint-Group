package lk.waypoint.core.workflow;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class) ResponseEntity<?> domain(ApiException e) { return ResponseEntity.status(e.status).body(Map.of("code",e.code,"message",e.getMessage())); }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class}) ResponseEntity<?> invalid(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code","INVALID_REQUEST","message","Check the request fields and formats."));
    }
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> constraint(DataIntegrityViolationException e) {
        return ResponseEntity.status(409).body(Map.of("code","CONSTRAINT_CONFLICT","message","This change conflicts with an existing assignment or quantity constraint. Reload and review."));
    }
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class) ResponseEntity<?> size(Exception e) {
        return ResponseEntity.status(413).body(Map.of("code","PROOF_TOO_LARGE","message","Use a JPEG or PNG image no larger than 5 MiB."));
    }
}
